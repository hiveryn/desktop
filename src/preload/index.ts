import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProfile,
  Architect,
  ArchitectInfo,
  DaemonResult,
  RequestLogEntry,
  Session,
  SessionEvent,
  SpawnResult,
  SystemHome,
  Ticket,
  TicketBoard,
  TicketCreateInput,
  TicketDeleteResult,
  TicketEditInput,
  TicketMetadataInput,
  TicketStatus,
} from '../shared/types';

// ── Request log listeners ──────────────────────────────────────────────────
type RequestCallback = (entry: RequestLogEntry) => void;
const requestListeners = new Set<RequestCallback>();

// ── Channel → HTTP method/path map for the log display ────────────────────
const CHANNEL_INFO: Record<string, { method: string; path: string }> = {
  'profiles:list': { method: 'GET', path: '/api/agent-profiles' },
  'sessions:list': { method: 'GET', path: '/api/sessions' },
  'sessions:create': { method: 'POST', path: '/api/sessions' },
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
  'architects:spawn': { method: 'POST', path: '/api/architects/:key/spawn' },
  'launcher:open-architect': { method: 'GET', path: '/api/architects/:key' },
  'session:connect': { method: 'WS', path: '/session/connect' },
  'session:disconnect': { method: 'WS', path: '/session/disconnect' },
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
  },
  architects: {
    list: (): Promise<Architect[]> => invoke('architects:list'),
    get: (key: string): Promise<Architect> => invoke('architects:get', key),
    spawn: (key: string, profileName: string, cols?: number, rows?: number): Promise<SpawnResult> =>
      invoke('architects:spawn', key, profileName, cols, rows),
  },
  session: {
    connect: (sessionId: string, wsUrl: string): Promise<void> =>
      invoke('session:connect', sessionId, wsUrl),
    disconnect: (): Promise<void> => invoke('session:disconnect'),
    send: (data: string): void => {
      ipcRenderer.send('session:send', data);
    },
    resize: (cols: number, rows: number): void => {
      ipcRenderer.send('session:resize', cols, rows);
    },
    onData: (callback: (data: Uint8Array | string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: Uint8Array | string): void =>
        callback(data);
      ipcRenderer.on('session:data', listener);
      return () => ipcRenderer.removeListener('session:data', listener);
    },
    onEvent: (callback: (event: SessionEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, event: SessionEvent): void =>
        callback(event);
      ipcRenderer.on('session:event', listener);
      return () => ipcRenderer.removeListener('session:event', listener);
    },
  },
  launcher: {
    openArchitect: (key: string): Promise<void> => invoke('launcher:open-architect', key),
  },
  sessions: {
    list: (): Promise<Session[]> => invoke('sessions:list'),
    create: (profileId: string, workdir: string): Promise<Session> =>
      invoke('sessions:create', profileId, workdir),
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
  daemon: {
    onRequest: (callback: RequestCallback): (() => void) => {
      requestListeners.add(callback);
      return () => requestListeners.delete(callback);
    },
  },
});
