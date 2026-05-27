import { ipcMain } from 'electron';
import type {
  DaemonResult,
  SessionIntent,
  SessionKind,
  SessionRunResult,
} from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, withNullData } from './results';

export function registerSessionsIpc(): void {
  ipcMain.handle('sessions:list', async (): Promise<DaemonResult<SessionIntent[]>> => {
    const result = await daemonFetch<{ sessions: SessionIntent[] }>('/api/sessions');
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
    async (
      _event,
      sessionType: SessionKind,
      architectKey: string,
      ticketId?: string,
    ): Promise<DaemonResult<SessionIntent>> => {
      return daemonFetch<SessionIntent>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          session_type: sessionType,
          architect_key: architectKey,
          ticket_id: ticketId,
        }),
      });
    },
  );

  ipcMain.handle(
    'sessions:createRun',
    async (
      _event,
      intentId: string,
      profileName: string,
      cols?: number,
      rows?: number,
    ): Promise<DaemonResult<SessionRunResult>> => {
      return daemonFetch<SessionRunResult>(`/api/sessions/${encodeURIComponent(intentId)}/runs`, {
        method: 'POST',
        body: JSON.stringify({ profile_name: profileName, cols, rows }),
      });
    },
  );

  ipcMain.handle(
    'sessions:createFreeform',
    async (
      _event,
      architectKey: string,
      prompt: string,
      workdir: string,
      slug: string,
    ): Promise<DaemonResult<SessionIntent>> => {
      return daemonFetch<SessionIntent>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          session_type: 'freeform',
          architect_key: architectKey,
          prompt,
          workdir,
          slug,
        }),
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

  ipcMain.handle(
    'sessions:approve-conclusion',
    async (_event, sessionId: string): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(
        `/api/sessions/${encodeURIComponent(sessionId)}/approve-conclusion`,
        { method: 'POST' },
      );
    },
  );

  ipcMain.handle(
    'sessions:reject-conclusion',
    async (_event, sessionId: string, reason?: string): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(`/api/sessions/${encodeURIComponent(sessionId)}/reject-conclusion`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
  );
}
