import type {
  ActionDecisionRequest,
  ActionRequest,
  AgentMessage,
  AgentQuestion,
  ConcludeSessionParams,
  CreateTerminalParams,
  Intent,
  Session,
  SessionEvent,
  SessionTab,
  SessionType,
  TerminalInfo,
  TerminalWorkdir,
  Ticket,
  TicketBoard,
  TicketStatus,
  WorkerPreflight,
  WorkflowList,
} from '@hiveryn/shared/domain';
import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActionDecisionResult,
  AgentProfile,
  AppMode,
  Architect,
  ArchitectStatus,
  ArchitectStreamEvent,
  DaemonHealthState,
  DaemonResult,
  DesktopConfig,
  InfraErrorEvent,
  RendererLogPayload,
  RepoCommitDiffResponse,
  RepoDiffResponse,
  RequestLogEntry,
  SessionRunResult,
  SystemRuntime,
  TicketCreateInput,
  TicketDeleteResult,
  TicketEditInput,
  TicketMetadataInput,
  WorkbenchRequest,
} from '../shared/types';

// ── Architect event listeners, per project key ────────────────────────────
const architectEventListeners = new Map<string, Set<(event: ArchitectStreamEvent) => void>>();
ipcRenderer.on(
  'architect:workspace-event',
  (_event: Electron.IpcRendererEvent, workspaceEvent: ArchitectStreamEvent) => {
    const listeners = architectEventListeners.get(workspaceEvent.architect_key);
    if (!listeners) return;
    for (const listener of [...listeners]) listener(workspaceEvent);
  },
);

// ── Request log listeners ──────────────────────────────────────────────────
type RequestCallback = (entry: RequestLogEntry) => void;
const requestListeners = new Set<RequestCallback>();

// ── Channel → HTTP method/path map for the log display ────────────────────
const CHANNEL_INFO: Record<string, { method: string; path: string }> = {
  'profiles:list': { method: 'GET', path: '/api/agent-profiles' },
  'sessions:list': { method: 'GET', path: '/api/sessions' },
  'sessions:get': { method: 'GET', path: '/api/sessions/:id' },
  'sessions:create': { method: 'POST', path: '/api/sessions' },
  'sessions:conclude': { method: 'POST', path: '/api/sessions/:id/conclude' },
  'sessions:discard': { method: 'POST', path: '/api/sessions/:id/discard' },
  'sessions:approve-intent': {
    method: 'POST',
    path: '/api/sessions/:id/intents/:intentId/approve',
  },
  'sessions:deny-intent': { method: 'POST', path: '/api/sessions/:id/intents/:intentId/deny' },
  'sessions:decide-action': {
    method: 'POST',
    path: '/api/sessions/:id/actions/:actionId/decision',
  },
  'sessions:answer-question': {
    method: 'POST',
    path: '/api/sessions/:id/questions/:questionId/answer',
  },
  'system:getRuntime': { method: 'GET', path: '/api/system/runtime' },
  'tickets:list': { method: 'GET', path: '/api/architects/:key/tickets' },
  'tickets:search': { method: 'GET', path: '/api/architects/:key/tickets?q=:query' },
  'tickets:get': { method: 'GET', path: '/api/architects/:key/tickets/:id' },
  'tickets:edit': { method: 'PATCH', path: '/api/architects/:key/tickets/:id' },
  'tickets:updateMetadata': { method: 'PATCH', path: '/api/architects/:key/tickets/:id/metadata' },
  'tickets:move': { method: 'POST', path: '/api/architects/:key/tickets/:id/move?to=:status' },
  'tickets:delete': { method: 'DELETE', path: '/api/architects/:key/tickets/:id' },
  'tickets:create': { method: 'POST', path: '/api/architects/:key/tickets' },
  'architects:list': { method: 'GET', path: '/api/architects' },
  'architects:get': { method: 'GET', path: '/api/architects/:key' },
  'architects:status': { method: 'GET', path: '/api/architects/status' },
  'architects:messages': { method: 'GET', path: '/api/architects/:key/messages' },
  'workflows:list': { method: 'GET', path: '/api/architects/:key/workflows' },
  'workflows:preflight': {
    method: 'GET',
    path: '/api/architects/:key/workspace/worker-preflight',
  },
  'sessions:createRun': { method: 'POST', path: '/api/sessions/:id/runs' },
  'architects:events:subscribe': { method: 'SSE', path: '/api/architects/:key/events' },
  'architects:events:unsubscribe': { method: 'SSE', path: '/api/architects/:key/events' },
  'session:subscribe': { method: 'SSE', path: '/api/sessions/:id/events' },
  'session:connect': { method: 'WS', path: '/session/connect' },
  'session:disconnect': { method: 'WS', path: '/session/disconnect' },
  'session:send': { method: 'WS', path: '/session/send' },
  'session:resize': { method: 'WS', path: '/session/resize' },
  'terminals:list': { method: 'GET', path: '/api/sessions/:id/terminals' },
  'terminals:listWorkdirs': { method: 'GET', path: '/api/sessions/:id/terminal-workdirs' },
  'terminals:create': { method: 'POST', path: '/api/sessions/:id/terminals' },
  'terminals:kill': { method: 'DELETE', path: '/api/sessions/:id/terminals/:uuid' },
  'tabs:list': { method: 'GET', path: '/api/sessions/:id/tabs' },
  'sessions:getTicket': { method: 'GET', path: '/api/sessions/:id/ticket' },
  'config:shortcuts': { method: 'GET', path: '/api/config/shortcuts' },
  'config:desktop': { method: 'GET', path: '/api/config/desktop' },
  'repos:diff': { method: 'GET', path: '/api/architects/:key/repos/:repoKey/diff' },
  'repos:commitDiff': {
    method: 'GET',
    path: '/api/architects/:key/repos/:repoKey/commits/:sha/diff',
  },
};

// Unwrap a DaemonResult: notify log listeners, throw IpcError on error, return data on success.
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const start = Date.now();
  let result: DaemonResult<T>;
  try {
    result = await ipcRenderer.invoke(channel, ...args);
  } catch (err) {
    const raw = (err as Error).message ?? String(err);
    throw new Error(raw.replace(/^Error invoking remote method '[^']+': Error: /, ''));
  }

  const { envelope, httpStatus } = result;
  const info = CHANNEL_INFO[channel];

  const entry: RequestLogEntry = {
    id: envelope.meta?.request_id || `local-${Date.now()}`,
    channel,
    method: info?.method ?? channel,
    path: info?.path ?? channel,
    httpStatus,
    durationMs: Date.now() - start,
    ts: Date.now(),
    envelope,
  };

  for (const cb of requestListeners) cb(entry);

  if (envelope.error) {
    throw Object.assign(new Error(envelope.error.message), {
      status: httpStatus,
      code: envelope.error.code,
      details: envelope.error.details,
      stacktrace: envelope.error.stacktrace,
    });
  }

  return envelope.data as T;
}

contextBridge.exposeInMainWorld('hiveryn', {
  user: {
    getProfile: (): Promise<{ data: { name: string } }> => invoke('user:getProfile'),
  },
  app: {
    getPlatform: (): Promise<string> => Promise.resolve(process.platform),
    getMode: (): Promise<AppMode> => ipcRenderer.invoke('app:getMode') as Promise<AppMode>,
    getDaemonUrl: (): Promise<string> => ipcRenderer.invoke('app:getDaemonUrl') as Promise<string>,
    onGpuProcessCrashed: (callback: () => void): (() => void) => {
      const listener = (): void => callback();
      ipcRenderer.on('app:gpu-process-crashed', listener);
      return () => ipcRenderer.removeListener('app:gpu-process-crashed', listener);
    },
  },
  profiles: {
    list: (): Promise<AgentProfile[]> => invoke('profiles:list'),
  },
  architects: {
    list: (): Promise<Architect[]> => invoke('architects:list'),
    get: (key: string): Promise<Architect> => invoke('architects:get', key),
    status: (): Promise<ArchitectStatus[]> => invoke('architects:status'),
    messages: (key: string): Promise<AgentMessage[]> => invoke('architects:messages', key),
    // Several consumers (board, session discovery, agent messages, sidebar)
    // listen to the same project's stream, and come and go independently as
    // projects are selected. The main process holds one stream per project for
    // this window, so it is opened by the first listener and closed by the last.
    subscribeEvents: (
      key: string,
      callback: (event: ArchitectStreamEvent) => void,
    ): (() => void) => {
      let listeners = architectEventListeners.get(key);
      if (!listeners) {
        listeners = new Set();
        architectEventListeners.set(key, listeners);
        void ipcRenderer.invoke('architects:events:subscribe', key);
      }
      listeners.add(callback);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        const current = architectEventListeners.get(key);
        if (!current) return;
        current.delete(callback);
        if (current.size > 0) return;
        architectEventListeners.delete(key);
        void ipcRenderer.invoke('architects:events:unsubscribe', key);
      };
    },
  },
  session: {
    subscribe: (sessionId: string): Promise<void> => invoke('session:subscribe', sessionId),
    connect: (
      sessionId: string,
      terminalId: string,
      size?: { cols: number; rows: number },
    ): Promise<void> => invoke('session:connect', sessionId, terminalId, size),
    disconnect: (sessionId?: string, terminalId?: string): Promise<void> =>
      invoke('session:disconnect', sessionId, terminalId),
    send: (sessionId: string, terminalId: string, data: string): void => {
      ipcRenderer.send('session:send', sessionId, terminalId, data);
    },
    resize: (sessionId: string, terminalId: string, cols: number, rows: number): void => {
      ipcRenderer.send('session:resize', sessionId, terminalId, cols, rows);
    },
    onData: (
      callback: (payload: {
        sessionId: string;
        terminalId: string;
        data: Uint8Array | string;
      }) => void,
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { sessionId: string; terminalId: string; data: Uint8Array | string },
      ): void => callback(payload);
      ipcRenderer.on('session:data', listener);
      return () => ipcRenderer.removeListener('session:data', listener);
    },
    onEvent: (callback: (event: SessionEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, event: SessionEvent): void =>
        callback(event);
      ipcRenderer.on('session:event', listener);
      return () => ipcRenderer.removeListener('session:event', listener);
    },
    onTerminalClosed: (
      callback: (payload: { sessionId: string; terminalId: string }) => void,
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { sessionId: string; terminalId: string },
      ): void => callback(payload);
      ipcRenderer.on('session:terminal-closed', listener);
      return () => ipcRenderer.removeListener('session:terminal-closed', listener);
    },
  },
  workbench: {
    // Requests from the main process: the global shortcut / tray icon
    // (reveal-sidebar-search) and notification clicks (select-session).
    onRequest: (callback: (request: WorkbenchRequest) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, request: WorkbenchRequest): void =>
        callback(request);
      ipcRenderer.on('workbench:request', listener);
      return () => ipcRenderer.removeListener('workbench:request', listener);
    },
    // The project whose intent cards are on screen (null: none).
    setIntentScope: (architectKey: string | null): void => {
      ipcRenderer.send('workbench:intent-scope', architectKey);
    },
  },
  workflows: {
    // Plain workflows available for explicit selection.
    list: (architectKey: string): Promise<WorkflowList> => invoke('workflows:list', architectKey),
    // Whether the workspace's required project context can host a worker now.
    preflight: (architectKey: string): Promise<WorkerPreflight> =>
      invoke('workflows:preflight', architectKey),
  },
  sessions: {
    list: (): Promise<Session[]> => invoke('sessions:list'),
    get: (sessionId: string): Promise<Session> => invoke('sessions:get', sessionId),
    create: (
      sessionType: SessionType,
      architectKey: string,
      ticketId?: string,
      workflows?: string[],
    ): Promise<Session> =>
      invoke('sessions:create', sessionType, architectKey, ticketId, workflows),
    createRun: (
      intentId: string,
      profileName: string,
      cols?: number,
      rows?: number,
    ): Promise<SessionRunResult> => invoke('sessions:createRun', intentId, profileName, cols, rows),
    conclude: (sessionId: string, params: ConcludeSessionParams): Promise<void> =>
      invoke('sessions:conclude', sessionId, params),
    discard: (sessionId: string): Promise<void> => invoke('sessions:discard', sessionId),
    approveIntent: (sessionId: string, intentId: string): Promise<Intent> =>
      invoke('sessions:approve-intent', sessionId, intentId),
    denyIntent: (sessionId: string, intentId: string, reason?: string): Promise<void> =>
      invoke('sessions:deny-intent', sessionId, intentId, reason),
    answerQuestion: (
      sessionId: string,
      questionId: string,
      answer: string,
    ): Promise<AgentQuestion> => invoke('sessions:answer-question', sessionId, questionId, answer),
    // Daemon errors come back as data: thrown across the context bridge they
    // would lose their status, code and details (the recorded outcome).
    decideAction: async (
      sessionId: string,
      actionId: string,
      decision: ActionDecisionRequest,
    ): Promise<ActionDecisionResult> => {
      try {
        const action = await invoke<ActionRequest>(
          'sessions:decide-action',
          sessionId,
          actionId,
          decision,
        );
        return { ok: true, action };
      } catch (err) {
        const e = err as { status?: number; code?: string; message?: string; details?: unknown };
        return {
          ok: false,
          error: {
            status: e.status ?? 0,
            code: e.code,
            message: e.message ?? String(err),
            details: e.details,
          },
        };
      }
    },
    getTicket: (sessionId: string): Promise<Ticket> => invoke('sessions:getTicket', sessionId),
  },
  tickets: {
    list: (architectKey: string): Promise<TicketBoard> => invoke('tickets:list', architectKey),
    search: (architectKey: string, query: string): Promise<TicketBoard> =>
      invoke('tickets:search', architectKey, query),
    get: (architectKey: string, id: string): Promise<Ticket> =>
      invoke('tickets:get', architectKey, id),
    edit: (architectKey: string, id: string, input: TicketEditInput): Promise<Ticket> =>
      invoke('tickets:edit', architectKey, id, input),
    updateMetadata: (
      architectKey: string,
      id: string,
      input: TicketMetadataInput,
    ): Promise<Ticket> => invoke('tickets:updateMetadata', architectKey, id, input),
    move: (architectKey: string, id: string, to: TicketStatus): Promise<Ticket> =>
      invoke('tickets:move', architectKey, id, to),
    delete: (architectKey: string, id: string): Promise<TicketDeleteResult> =>
      invoke('tickets:delete', architectKey, id),
    create: (architectKey: string, input: TicketCreateInput): Promise<Ticket> =>
      invoke('tickets:create', architectKey, input),
  },
  system: {
    getRuntime: (): Promise<SystemRuntime> => invoke('system:getRuntime'),
    getUserHome: (): Promise<string> => ipcRenderer.invoke('system:getUserHome') as Promise<string>,
  },
  terminals: {
    listWorkdirs: (sessionId: string): Promise<TerminalWorkdir[]> =>
      invoke('terminals:listWorkdirs', sessionId),
    list: (sessionId: string): Promise<TerminalInfo[]> => invoke('terminals:list', sessionId),
    create: (sessionId: string, body: CreateTerminalParams): Promise<TerminalInfo> =>
      invoke('terminals:create', sessionId, body),
    kill: (sessionId: string, terminalId: string): Promise<void> =>
      invoke('terminals:kill', sessionId, terminalId),
  },
  tabs: {
    list: (sessionId: string): Promise<SessionTab[]> => invoke('tabs:list', sessionId),
  },
  repos: {
    diff: (architectKey: string, repoKey: string): Promise<RepoDiffResponse> =>
      invoke('repos:diff', architectKey, repoKey),
    commitDiff: (
      architectKey: string,
      repoKey: string,
      sha: string,
    ): Promise<RepoCommitDiffResponse> => invoke('repos:commitDiff', architectKey, repoKey, sha),
  },
  daemon: {
    getHealthStatus: (): Promise<DaemonHealthState> => ipcRenderer.invoke('daemon:health:get'),
    onHealthStatus: (callback: (state: DaemonHealthState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: DaemonHealthState): void =>
        callback(state);
      ipcRenderer.on('daemon:health-status', listener);
      return () => ipcRenderer.removeListener('daemon:health-status', listener);
    },
    onRequest: (callback: RequestCallback): (() => void) => {
      requestListeners.add(callback);
      return () => requestListeners.delete(callback);
    },
  },
  errors: {
    onInfraEvent: (callback: (event: InfraErrorEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: InfraErrorEvent): void =>
        callback(payload);
      ipcRenderer.on('errors:infra-event', listener);
      return () => ipcRenderer.removeListener('errors:infra-event', listener);
    },
  },
  logs: {
    writeRenderer: (entry: RendererLogPayload): void => {
      ipcRenderer.send('logs:renderer', entry);
    },
  },
  config: {
    getShortcuts: (): Promise<Record<string, Record<string, string>>> => invoke('config:shortcuts'),
    getDesktop: (): Promise<DesktopConfig> => invoke('config:desktop'),
  },
});
