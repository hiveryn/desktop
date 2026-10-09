import type {
  AgentQuestion,
  AnswerQuestionRequest,
  ApproveIntentRequest,
  ConcludeSessionParams,
  Intent,
  IntentInputValues,
  Session,
  SessionType,
  Ticket,
} from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { DaemonResult, SessionRunResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, withNullData } from './results';

// Launching a run validates and prepares the worker, which for a remote worker
// is many SSH round trips. The daemon bounds a launch at two minutes and reports
// its own error; this bound sits beyond it so that error is what the user sees.
const RUN_LAUNCH_TIMEOUT_MS = 150_000;

// Concluding or discarding a session confirms remote termination over SSH. The
// daemon owns that operation once accepted, bounded at two minutes; this sits
// beyond it so its own error is what the user sees.
const SESSION_END_TIMEOUT_MS = 150_000;

// Approving runs the approved operation (a remote conclusion, a worker launch)
// on the daemon, bounded at three minutes plus recording its outcome. Denying
// runs nothing but records the denial. Both sit beyond the daemon's bounds.
const INTENT_APPROVE_TIMEOUT_MS = 240_000;
const INTENT_DENY_TIMEOUT_MS = 45_000;

// A client timeout is not the operation's outcome: once accepted, the daemon
// finishes it and publishes the result whether or not anyone is still waiting.
function explainStoppedWaiting<T>(result: DaemonResult<T>, continuation: string): DaemonResult<T> {
  const error = result.envelope.error;
  if (error?.code === 'TIMEOUT') {
    error.message += `. Hiveryn stopped waiting, but the daemon did not stop: ${continuation}`;
  }
  return result;
}

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
      workflows?: string[],
    ): Promise<DaemonResult<Session>> => {
      return daemonFetch<Session>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          session_type: sessionType,
          architect_key: architectKey,
          ticket_id: ticketId,
          // The explicit, user-confirmed workflow selection. Sent verbatim: the
          // daemon validates every canonical path against the live workspace
          // and never drops or substitutes one. Omitted for non-ticket
          // sessions, which reject the field.
          workflows,
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
      const result = await daemonFetch<SessionRunResult>(
        `/api/sessions/${encodeURIComponent(intentId)}/runs`,
        { method: 'POST', body: JSON.stringify({ profile_name: profileName, cols, rows }) },
        { timeoutMs: RUN_LAUNCH_TIMEOUT_MS },
      );
      const error = result.envelope.error;
      if (error?.code === 'TIMEOUT') {
        // The daemon finishes a launch whether or not anyone is still waiting.
        error.message +=
          '. The launch continues in the daemon: the session appears when it starts; otherwise Spawn again to see its error.';
      }
      return result;
    },
  );

  ipcMain.handle(
    'sessions:conclude',
    async (
      _event,
      sessionId: string,
      params: ConcludeSessionParams,
    ): Promise<DaemonResult<null>> => {
      const result = await daemonFetch<null>(
        `/api/sessions/${encodeURIComponent(sessionId)}/conclude`,
        {
          method: 'POST',
          body: JSON.stringify({
            body: params.body,
            commits: params.commits,
            outcome: params.outcome,
            rejection_reason: params.rejection_reason,
          }),
        },
        { timeoutMs: SESSION_END_TIMEOUT_MS },
      );
      return explainStoppedWaiting(
        result,
        'the session closes when the conclusion is applied; if it stays open, conclude again to see its error.',
      );
    },
  );

  ipcMain.handle(
    'sessions:discard',
    async (_event, sessionId: string): Promise<DaemonResult<null>> => {
      const result = await daemonFetch<null>(
        `/api/sessions/${encodeURIComponent(sessionId)}/discard`,
        { method: 'POST' },
        { timeoutMs: SESSION_END_TIMEOUT_MS },
      );
      return explainStoppedWaiting(
        result,
        'the session closes when the discard is applied; if it stays open, discard again to see its error.',
      );
    },
  );

  // Generic intent approve/deny, addressed by intent id. The desktop uses one
  // pair of routes for every tool; the daemon runs the tool's side effect on
  // approve and nothing on deny. A 404 means the intent already resolved.
  // Approval carries the intent's input values, if it has inputs; the daemon
  // validates them and a 400 leaves the intent pending for correction.
  ipcMain.handle(
    'sessions:approve-intent',
    async (
      _event,
      sessionId: string,
      intentId: string,
      inputs?: IntentInputValues,
    ): Promise<DaemonResult<Intent>> => {
      const body: ApproveIntentRequest = inputs ? { inputs } : {};
      const result = await daemonFetch<Intent>(
        `/api/sessions/${encodeURIComponent(sessionId)}/intents/${encodeURIComponent(intentId)}/approve`,
        { method: 'POST', body: JSON.stringify(body) },
        { timeoutMs: INTENT_APPROVE_TIMEOUT_MS },
      );
      return explainStoppedWaiting(
        result,
        'the approved operation continues, and the request shows its outcome when the daemon reports it.',
      );
    },
  );

  ipcMain.handle(
    'sessions:answer-question',
    async (
      _event,
      sessionId: string,
      questionId: string,
      answer: string,
    ): Promise<DaemonResult<AgentQuestion>> => {
      const body: AnswerQuestionRequest = { answer };
      return daemonFetch<AgentQuestion>(
        `/api/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/answer`,
        { method: 'POST', body: JSON.stringify(body) },
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
      const result = await daemonFetch<null>(
        `/api/sessions/${encodeURIComponent(sessionId)}/intents/${encodeURIComponent(intentId)}/deny`,
        { method: 'POST', body: JSON.stringify({ reason: reason ?? '' }) },
        { timeoutMs: INTENT_DENY_TIMEOUT_MS },
      );
      return explainStoppedWaiting(result, 'the denial is recorded when the daemon finishes it.');
    },
  );

  ipcMain.handle(
    'sessions:getTicket',
    async (_event, sessionId: string): Promise<DaemonResult<Ticket>> => {
      return daemonFetch<Ticket>(`/api/sessions/${encodeURIComponent(sessionId)}/ticket`);
    },
  );
}
