import { ipcMain } from 'electron';
import type { DaemonResult, Session } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, withNullData } from './results';

export function registerSessionsIpc(): void {
  ipcMain.handle('sessions:list', async (): Promise<DaemonResult<Session[]>> => {
    const result = await daemonFetch<{ sessions: Session[] }>('/api/sessions');
    if (result.envelope.error) {
      return withNullData(result);
    }
    if (!Array.isArray(result.envelope.data?.sessions)) {
      return invalidDaemonResponse('sessions:list returned missing sessions array');
    }
    return {
      httpStatus: result.httpStatus,
      envelope: { ...result.envelope, data: result.envelope.data.sessions },
    };
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
    'sessions:conclude',
    async (_event, sessionId: string, body: string): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(`/api/sessions/${encodeURIComponent(sessionId)}/conclude`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    },
  );
}
