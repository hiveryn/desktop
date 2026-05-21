import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProfile,
  Architect,
  ArchitectInfo,
  CreateTerminalBody,
  DaemonHealthState,
  DaemonResult,
  DesktopConfig,
  RendererLogPayload,
  RequestLogEntry,
  SessionEvent,
  SessionIntent,
  SessionKind,
  SessionRunResult,
  SessionTab,
  SystemHome,
  TerminalInfo,
  Ticket,
  TicketBoard,
  TicketCreateInput,
  TicketDeleteResult,
  TicketEditInput,
  TicketMetadataInput,
  TicketStatus,
  WorkspaceChangedEvent,
} from '../shared/types';

// ── Request log listeners ──────────────────────────────────────────────────
type RequestCallback = (entry: RequestLogEntry) => void;
const requestListeners = new Set<RequestCallback>();

// ── Channel → HTTP method/path map for the log display ────────────────────
const CHANNEL_INFO: Record<string, { method: string; path: string }> = {
  'profiles:list': { method: 'GET', path: '/api/agent-profiles' },
  'sessions:list': { method: 'GET', path: '/api/sessions' },
  'sessions:create': { method: 'POST', path: '/api/sessions' },
  'sessions:conclude': { method: 'POST', path: '/api/sessions/:id/conclude' },
  'system:getHome': { method: 'GET', path: '/api/system/home' },
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
  'sessions:createRun': { method: 'POST', path: '/api/sessions/:id/runs' },
  'sessions:createFreeform': { method: 'POST', path: '/api/sessions' },
  'architects:events:subscribe': { method: 'SSE', path: '/api/architects/:key/events' },
  'architects:events:unsubscribe': { method: 'SSE', path: '/api/architects/:key/events' },
  'launcher:open-architect': { method: 'GET', path: '/api/architects/:key' },
  'session:subscribe': { method: 'SSE', path: '/api/sessions/:id/events' },
  'session:connect': { method: 'WS', path: '/session/connect' },
  'session:disconnect': { method: 'WS', path: '/session/disconnect' },
  'session:send': { method: 'WS', path: '/session/send' },
  'session:resize': { method: 'WS', path: '/session/resize' },
  'terminals:list': { method: 'GET', path: '/api/sessions/:id/terminals' },
  'terminals:create': { method: 'POST', path: '/api/sessions/:id/terminals' },
  'terminals:kill': { method: 'DELETE', path: '/api/sessions/:id/terminals/:uuid' },
  'tabs:list': { method: 'GET', path: '/api/sessions/:id/tabs' },
  'architect:closeWindow': { method: 'POST', path: '/architect/close' },
  'config:shortcuts': { method: 'GET', path: '/api/config/shortcuts' },
  'config:desktop': { method: 'GET', path: '/api/config/desktop' },
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
  preferences: {
    getTheme: (): Promise<'dark' | 'light' | 'system'> => invoke('preferences:getTheme'),
    setTheme: (value: 'dark' | 'light' | 'system'): Promise<void> =>
      invoke('preferences:setTheme', value),
    onThemeChange: (callback: (value: 'dark' | 'light') => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: 'dark' | 'light'): void =>
        callback(value);
      ipcRenderer.on('preferences:theme-change', listener);
      return () => ipcRenderer.removeListener('preferences:theme-change', listener);
    },
  },
  user: {
    getProfile: (): Promise<{ data: { name: string } }> => invoke('user:getProfile'),
  },
  app: {
    getPlatform: (): Promise<string> => Promise.resolve(process.platform),
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
    subscribeEvents: (
      key: string,
      callback: (event: WorkspaceChangedEvent) => void,
    ): (() => void) => {
      void ipcRenderer.invoke('architects:events:subscribe', key);
      const listener = (
        _event: Electron.IpcRendererEvent,
        workspaceEvent: WorkspaceChangedEvent,
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
    connect: (sessionId: string, terminalId: string): Promise<void> =>
      invoke('session:connect', sessionId, terminalId),
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
  sessions: {
    list: (): Promise<SessionIntent[]> => invoke('sessions:list'),
    create: (
      sessionType: SessionKind,
      architectKey: string,
      ticketId?: string,
    ): Promise<SessionIntent> => invoke('sessions:create', sessionType, architectKey, ticketId),
    createRun: (
      intentId: string,
      profileName: string,
      cols?: number,
      rows?: number,
    ): Promise<SessionRunResult> => invoke('sessions:createRun', intentId, profileName, cols, rows),
    conclude: (sessionId: string, body: string): Promise<void> =>
      invoke('sessions:conclude', sessionId, body),
    createFreeform: (
      architectKey: string,
      prompt: string,
      workdir: string,
      slug: string,
    ): Promise<SessionIntent> =>
      invoke('sessions:createFreeform', architectKey, prompt, workdir, slug),
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
    getHome: (): Promise<SystemHome> => invoke('system:getHome'),
  },
  terminals: {
    list: (sessionId: string): Promise<TerminalInfo[]> => invoke('terminals:list', sessionId),
    create: (sessionId: string, body: CreateTerminalBody): Promise<TerminalInfo> =>
      invoke('terminals:create', sessionId, body),
    kill: (sessionId: string, terminalId: string): Promise<void> =>
      invoke('terminals:kill', sessionId, terminalId),
  },
  tabs: {
    list: (sessionId: string): Promise<SessionTab[]> => invoke('tabs:list', sessionId),
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
