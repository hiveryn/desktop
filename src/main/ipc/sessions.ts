import { ipcMain } from 'electron';
import type { DaemonResult, Session } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

function empty<T>(data: T): DaemonResult<T> {
  return {
    httpStatus: 200,
    envelope: { data, error: null, logs: [], commands: [], meta: { request_id: '' } },
  };
}

export function registerSessionsIpc(): void {
  ipcMain.handle('sessions:list', async (): Promise<DaemonResult<Session[]>> => {
    const result = await daemonFetch<{ sessions: Session[] }>('/api/sessions');
    if (result.httpStatus === 0 || result.httpStatus === 404) {
      return empty<Session[]>([]);
    }
    return {
      httpStatus: result.httpStatus,
      envelope: { ...result.envelope, data: result.envelope.data?.sessions ?? [] },
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
}
