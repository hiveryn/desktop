import { ipcMain } from 'electron';
import type { DaemonResult, SessionTab } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerTabsIpc(): void {
  ipcMain.handle(
    'tabs:list',
    async (_event, sessionId: string): Promise<DaemonResult<SessionTab[]>> => {
      const result = await daemonFetch<SessionTab[]>(
        `/api/sessions/${encodeURIComponent(sessionId)}/tabs`,
      );
      if (result.httpStatus === 0 || result.httpStatus === 404) {
        return {
          httpStatus: 200,
          envelope: { data: [], error: null, logs: [], commands: [], meta: { request_id: '' } },
        };
      }
      return {
        httpStatus: result.httpStatus,
        envelope: { ...result.envelope, data: result.envelope.data ?? [] },
      };
    },
  );
}
