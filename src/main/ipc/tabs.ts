import type { SessionTab } from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, withNullData } from './results';

export function registerTabsIpc(): void {
  ipcMain.handle(
    'tabs:list',
    async (_event, sessionId: string): Promise<DaemonResult<SessionTab[]>> => {
      const result = await daemonFetch<SessionTab[]>(
        `/api/sessions/${encodeURIComponent(sessionId)}/tabs`,
      );
      if (result.envelope.error) {
        return withNullData(result);
      }
      if (!Array.isArray(result.envelope.data)) {
        return invalidDaemonResponse(
          `tabs:list returned non-array payload for session ${sessionId}`,
        );
      }
      return {
        httpStatus: result.httpStatus,
        envelope: { ...result.envelope, data: result.envelope.data },
      };
    },
  );
}
