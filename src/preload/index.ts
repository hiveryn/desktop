import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProfile,
  AgentProfileInput,
  Architect,
  ArchitectInfo,
  DaemonResult,
  KanbanTicket,
  RequestLogEntry,
  Session,
  SystemHome,
} from '../shared/types';

// ── Request log listeners ──────────────────────────────────────────────────
type RequestCallback = (entry: RequestLogEntry) => void;
const requestListeners = new Set<RequestCallback>();

// ── Channel → HTTP method/path map for the log display ────────────────────
const CHANNEL_INFO: Record<string, { method: string; path: string }> = {
  'profiles:list': { method: 'GET', path: '/api/agent-profiles' },
  'profiles:create': { method: 'POST', path: '/api/agent-profiles' },
  'profiles:update': { method: 'PUT', path: '/api/agent-profiles/:id' },
  'profiles:delete': { method: 'DELETE', path: '/api/agent-profiles/:id' },
  'sessions:list': { method: 'GET', path: '/api/sessions' },
  'sessions:create': { method: 'POST', path: '/api/sessions' },
  'system:getHome': { method: 'GET', path: '/api/system/home' },
  'tickets:list': { method: 'GET', path: '/api/tickets' },
  'architect:getInfo': { method: 'GET', path: '/architect/info' },
  'architect:openLauncher': { method: 'POST', path: '/architect/launcher' },
  'architects:list': { method: 'GET', path: '/api/architects' },
  'architects:get': { method: 'GET', path: '/api/architects/:id' },
  'architects:delete': { method: 'DELETE', path: '/api/architects/:id' },
  'launcher:open-architect': { method: 'GET', path: '/api/architects/:id' },
  'launcher:register-architect': { method: 'POST', path: '/api/architects' },
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
    create: (input: AgentProfileInput): Promise<AgentProfile> => invoke('profiles:create', input),
    update: (id: string, input: AgentProfileInput): Promise<AgentProfile> =>
      invoke('profiles:update', id, input),
    delete: (id: string): Promise<void> => invoke('profiles:delete', id),
  },
  architect: {
    getInfo: (): Promise<ArchitectInfo> => invoke('architect:getInfo'),
    openLauncher: (): Promise<void> => invoke('architect:openLauncher'),
  },
  architects: {
    list: (): Promise<Architect[]> => invoke('architects:list'),
    get: (id: string): Promise<Architect> => invoke('architects:get', id),
    delete: (id: string): Promise<void> => invoke('architects:delete', id),
  },
  launcher: {
    openArchitect: (id: string): Promise<void> => invoke('launcher:open-architect', id),
    registerArchitect: (path: string, title: string): Promise<{ id: string }> =>
      invoke('launcher:register-architect', path, title),
  },
  sessions: {
    list: (): Promise<Session[]> => invoke('sessions:list'),
    create: (profileId: string, workdir: string): Promise<Session> =>
      invoke('sessions:create', profileId, workdir),
  },
  tickets: {
    list: (): Promise<KanbanTicket[]> => invoke('tickets:list'),
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
