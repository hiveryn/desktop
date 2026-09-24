import type {
  ConcludeSessionParams,
  CreateTerminalParams,
  Intent,
  IntentInputValues,
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
  AgentProfile,
  AppMode,
  Architect,
  ArchitectInfo,
  ArchitectStatus,
  ArchitectStreamEvent,
  DaemonHealthState,
  DaemonResult,
  DesktopConfig,
  FsContentSearchResponse,
  FsFileResponse,
  FsSearchResponse,
  FsTreeResponse,
  FsWriteResponse,
  InfraErrorEvent,
  RendererLogPayload,
  RepoCommitDiffResponse,
  RepoDiffResponse,
  RepoStatusResponse,
  RequestLogEntry,
  SessionRunResult,
  SystemRuntime,
  TicketCreateInput,
  TicketDeleteResult,
  TicketEditInput,
  TicketMetadataInput,
} from '../shared/types';

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
  'system:getRuntime': { method: 'GET', path: '/api/system/runtime' },
  'tickets:list': { method: 'GET', path: '/api/architects/:key/tickets' },
  'tickets:get': { method: 'GET', path: '/api/architects/:key/tickets/:id' },
  'tickets:edit': { method: 'PATCH', path: '/api/architects/:key/tickets/:id' },
  'tickets:updateMetadata': { method: 'PATCH', path: '/api/architects/:key/tickets/:id/metadata' },
  'tickets:move': { method: 'POST', path: '/api/architects/:key/tickets/:id/move?to=:status' },
  'tickets:delete': { method: 'DELETE', path: '/api/architects/:key/tickets/:id' },
  'tickets:create': { method: 'POST', path: '/api/architects/:key/tickets' },
  'architect:getInfo': { method: 'GET', path: '/architect/info' },
  'architect:openLauncher': { method: 'POST', path: '/architect/launcher' },
  'architects:list': { method: 'GET', path: '/api/architects' },
  'architects:get': { method: 'GET', path: '/api/architects/:key' },
  'architects:status': { method: 'GET', path: '/api/architects/status' },
  'workflows:list': { method: 'GET', path: '/api/architects/:key/workflows?repos=:repos' },
  'workflows:preflight': {
    method: 'GET',
    path: '/api/architects/:key/workspace/worker-preflight',
  },
  'palette:focus-architect': { method: 'POST', path: '/architect/focus' },
  'sessions:createRun': { method: 'POST', path: '/api/sessions/:id/runs' },
  'architects:events:subscribe': { method: 'SSE', path: '/api/architects/:key/events' },
  'architects:events:unsubscribe': { method: 'SSE', path: '/api/architects/:key/events' },
  'launcher:open-architect': { method: 'GET', path: '/api/architects/:key' },
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
  'architect:closeWindow': { method: 'POST', path: '/architect/close' },
  'config:shortcuts': { method: 'GET', path: '/api/config/shortcuts' },
  'config:desktop': { method: 'GET', path: '/api/config/desktop' },
  'repos:diff': { method: 'GET', path: '/api/architects/:key/repos/:repoKey/diff' },
  'repos:status': { method: 'GET', path: '/api/architects/:key/repos/:repoKey/status' },
  'repos:commitDiff': {
    method: 'GET',
    path: '/api/architects/:key/repos/:repoKey/commits/:sha/diff',
  },
  'tray:hide': { method: 'IPC', path: '/tray/hide' },
  'tray:set-height': { method: 'IPC', path: '/tray/set-height' },
  'fs:listDir': { method: 'GET', path: '/api/fs/tree?path=:path' },
  'fs:readFile': { method: 'GET', path: '/api/fs/file?path=:path' },
  'fs:writeFile': { method: 'PUT', path: '/api/fs/file?path=:path' },
  'fs:createFile': { method: 'PUT', path: '/api/fs/file?path=:path&create=true' },
  'fs:search': { method: 'GET', path: '/api/fs/search?path=:path&q=:q' },
  'fs:searchContent': { method: 'GET', path: '/api/fs/search-content?path=:path&q=:q' },
  'fs:pickDirectory': { method: 'IPC', path: '/fs/pick-directory' },
  'fs:revealInFinder': { method: 'IPC', path: '/fs/reveal-in-finder' },
  'fs:openExternal': { method: 'IPC', path: '/fs/open-external' },
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
  architect: {
    getInfo: (): Promise<ArchitectInfo> => invoke('architect:getInfo'),
    openLauncher: (): Promise<void> => invoke('architect:openLauncher'),
    closeWindow: (): Promise<void> => invoke('architect:closeWindow'),
  },
  architects: {
    list: (): Promise<Architect[]> => invoke('architects:list'),
    get: (key: string): Promise<Architect> => invoke('architects:get', key),
    status: (): Promise<ArchitectStatus[]> => invoke('architects:status'),
    subscribeEvents: (
      key: string,
      callback: (event: ArchitectStreamEvent) => void,
    ): (() => void) => {
      void ipcRenderer.invoke('architects:events:subscribe', key);
      const listener = (
        _event: Electron.IpcRendererEvent,
        workspaceEvent: ArchitectStreamEvent,
      ): void => {
        if (workspaceEvent.architect_key !== key) return;
        callback(workspaceEvent);
      };
      ipcRenderer.on('architect:workspace-event', listener);
      return () => {
        void ipcRenderer.invoke('architects:events:unsubscribe', key);
        ipcRenderer.removeListener('architect:workspace-event', listener);
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
  launcher: {
    openArchitect: (key: string): Promise<void> => invoke('launcher:open-architect', key),
  },
  tray: {
    hide: (): Promise<void> => invoke('tray:hide'),
    setHeight: (height: number): Promise<void> => invoke('tray:set-height', height),
    onShown: (callback: () => void): (() => void) => {
      const listener = (): void => callback();
      ipcRenderer.on('tray:shown', listener);
      return () => ipcRenderer.removeListener('tray:shown', listener);
    },
  },
  palette: {
    focusArchitect: (key: string, sessionId?: string): Promise<void> =>
      invoke('palette:focus-architect', key, sessionId),
    onSwitchSession: (callback: (sessionId: string | null) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, sessionId: string | null): void =>
        callback(sessionId);
      ipcRenderer.on('palette:switch-session', listener);
      return () => ipcRenderer.removeListener('palette:switch-session', listener);
    },
  },
  workflows: {
    // Discovery for a ticket's writable repo scope (primary + additional).
    list: (architectKey: string, repos: string[]): Promise<WorkflowList> =>
      invoke('workflows:list', architectKey, repos),
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
    approveIntent: (
      sessionId: string,
      intentId: string,
      inputs?: IntentInputValues,
    ): Promise<Intent> => invoke('sessions:approve-intent', sessionId, intentId, inputs),
    denyIntent: (sessionId: string, intentId: string, reason?: string): Promise<void> =>
      invoke('sessions:deny-intent', sessionId, intentId, reason),
    getTicket: (sessionId: string): Promise<Ticket> => invoke('sessions:getTicket', sessionId),
  },
  tickets: {
    list: (architectKey: string): Promise<TicketBoard> => invoke('tickets:list', architectKey),
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
  fs: {
    listDir: (path: string): Promise<FsTreeResponse> => invoke('fs:listDir', path),
    search: (path: string, query: string): Promise<FsSearchResponse> =>
      invoke('fs:search', path, query),
    searchContent: (path: string, query: string): Promise<FsContentSearchResponse> =>
      invoke('fs:searchContent', path, query),
    readFile: (path: string): Promise<FsFileResponse> => invoke('fs:readFile', path),
    writeFile: (path: string, content: string): Promise<FsWriteResponse> =>
      invoke('fs:writeFile', path, content),
    createFile: (path: string): Promise<FsWriteResponse> => invoke('fs:createFile', path),
    pickDirectory: (): Promise<string | null> => invoke('fs:pickDirectory'),
    revealInFinder: (path: string): Promise<null> => invoke('fs:revealInFinder', path),
    openExternal: (path: string): Promise<null> => invoke('fs:openExternal', path),
  },
  editor: {
    // One-way dirty-buffer count for the main-process close guard; not a
    // daemon call, so it bypasses invoke()/the request log.
    setDirtyCount: (count: number): void => {
      ipcRenderer.send('editor:dirty-count', count);
    },
  },
  repos: {
    diff: (architectKey: string, repoKey: string): Promise<RepoDiffResponse> =>
      invoke('repos:diff', architectKey, repoKey),
    status: (architectKey: string, repoKey: string): Promise<RepoStatusResponse> =>
      invoke('repos:status', architectKey, repoKey),
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
