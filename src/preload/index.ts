import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProfile,
  AgentProfileInput,
  DaemonResult,
  RequestLogEntry,
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
};

// Unwrap a DaemonResult: notify log listeners, throw IpcError on error, return data on success.
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const start = Date.now();
  let result: DaemonResult<T>;
  try {
    result = await ipcRenderer.invoke(channel, ...args);
  } catch (err) {
    // IPC-level failure (no handler registered, etc.) — not a daemon error
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
  daemon: {
    onRequest: (callback: RequestCallback): (() => void) => {
      requestListeners.add(callback);
      return () => requestListeners.delete(callback);
    },
  },
});
