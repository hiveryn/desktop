import type {
  ConcludeSessionParams,
  Intent,
  Session,
  SessionType,
  Ticket,
} from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { DaemonResult, SessionRunResult } from '../../shared/types';
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
    'sessions:get',
    async (_event, sessionId: string): Promise<DaemonResult<Session>> => {
      return daemonFetch<Session>(`/api/sessions/${encodeURIComponent(sessionId)}`);
    },
  );

  ipcMain.handle(
    'sessions:create',
    async (
      _event,
      sessionType: SessionType,
      architectKey: string,
      ticketId?: string,
    ): Promise<DaemonResult<Session>> => {
      return daemonFetch<Session>('/api/sessions', {
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
    ): Promise<DaemonResult<Session>> => {
      return daemonFetch<Session>('/api/sessions', {
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
    async (
      _event,
      sessionId: string,
      params: ConcludeSessionParams,
    ): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(`/api/sessions/${encodeURIComponent(sessionId)}/conclude`, {
        method: 'POST',
        body: JSON.stringify({
          body: params.body,
          commits: params.commits,
          outcome: params.outcome,
          rejection_reason: params.rejection_reason,
        }),
      });
    },
  );

  ipcMain.handle(
    'sessions:discard',
    async (_event, sessionId: string): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(`/api/sessions/${encodeURIComponent(sessionId)}/discard`, {
        method: 'POST',
      });
    },
  );

  // Generic intent approve/deny, addressed by intent id. The desktop uses one
  // pair of routes for every tool; the daemon runs the tool's side effect on
  // approve and nothing on deny. A 404 means the intent already resolved.
  ipcMain.handle(
    'sessions:approve-intent',
    async (_event, sessionId: string, intentId: string): Promise<DaemonResult<Intent>> => {
      return daemonFetch<Intent>(
        `/api/sessions/${encodeURIComponent(sessionId)}/intents/${encodeURIComponent(intentId)}/approve`,
        { method: 'POST' },
      );
    },
  );

  ipcMain.handle(
    'sessions:deny-intent',
    async (
      _event,
      sessionId: string,
      intentId: string,
      reason?: string,
    ): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(
        `/api/sessions/${encodeURIComponent(sessionId)}/intents/${encodeURIComponent(intentId)}/deny`,
        { method: 'POST', body: JSON.stringify({ reason: reason ?? '' }) },
      );
    },
  );

  ipcMain.handle(
    'sessions:getTicket',
    async (_event, sessionId: string): Promise<DaemonResult<Ticket>> => {
      return daemonFetch<Ticket>(`/api/sessions/${encodeURIComponent(sessionId)}/ticket`);
    },
  );
}
