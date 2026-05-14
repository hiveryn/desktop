import { ipcMain } from 'electron';
import type { DaemonResult, Session } from '../../shared/types';
import { DAEMON_URL, daemonFetch } from '../daemon/client';

function empty<T>(data: T): DaemonResult<T> {
  return {
    httpStatus: 200,
    envelope: { data, error: null, logs: [], commands: [], meta: { request_id: '' } },
  };
}

export function registerSessionsIpc(): void {
  ipcMain.handle('sessions:list', async (): Promise<DaemonResult<Session[]>> => {
    const result = await daemonFetch<{ sessions: Record<string, unknown>[] }>('/api/sessions');
    if (result.httpStatus === 0 || result.httpStatus === 404) {
      return empty<Session[]>([]);
    }
    const rawSessions =
      (result.envelope.data as { sessions: Record<string, unknown>[] } | null)?.sessions ?? [];
    const wsBase = DAEMON_URL.replace(/^http/, 'ws');
    const sessions = rawSessions.map((s) => ({
      ...s,
      ws_url: `${wsBase}/ws/session/${encodeURIComponent(String(s.id))}/terminal/main`,
    })) as unknown as Session[];
    return { httpStatus: result.httpStatus, envelope: { ...result.envelope, data: sessions } };
  });

  ipcMain.handle(
    'sessions:create',
    async (_event, profileId: string, workdir: string): Promise<DaemonResult<Session>> => {
      return daemonFetch<Session>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ profile_id: profileId, workdir }),
      });
    },
  );

  ipcMain.handle(
    'sessions:delete',
    async (_event, sessionId: string): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
    },
  );
}
