import type { ActionRun } from '@hiveryn/shared/domain';
import { useErrorCenterStore } from '../../../state/errorCenterStore';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';
import { buildSessionRecord } from '../../architect-window/hooks/sessionSnapshot';
import { sessionTabLabel } from '../actionsModel';

// Discovery of the running action sessions this window shows as bottom tabs.
// An action session's context_id is its execution id; the tab is labelled with
// the execution's action. Syncs are chained so overlapping triggers (mount,
// stream events, reconnect, launch) can never apply an older snapshot last.
let chain: Promise<unknown> = Promise.resolve();

export function syncActionSessions(runs: ActionRun[]): Promise<string[]> {
  const next = chain.catch(() => undefined).then(() => runSync(runs));
  chain = next.catch(() => undefined);
  return next;
}

async function runSync(runs: ActionRun[]): Promise<string[]> {
  const known = new Set(Object.keys(useSessionStore.getState().sessions));
  const runsById = new Map(runs.map((run) => [run.id, run]));

  const sessions = await window.hiveryn.sessions.list();
  const running = sessions.filter(
    (session) => session.session_type === 'action' && session.current_run?.status === 'running',
  );
  const tabsBySession = await Promise.all(
    running.map((session) => window.hiveryn.tabs.list(session.id)),
  );

  const records: SessionRecord[] = [];
  running.forEach((session, index) => {
    try {
      records.push(
        buildSessionRecord(
          session,
          tabsBySession[index],
          sessionTabLabel(runsById.get(session.context_id), session.context_id),
        ),
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      useErrorCenterStore.getState().pushError({
        title: 'Action session discovery',
        message: `Action session ${session.id} could not be shown: ${err.message}`,
        timestamp: Date.now(),
        details: { session_id: session.id, execution_id: session.context_id },
        stacktrace: err.stack,
      });
    }
  });

  useSessionStore.getState().reconcileSessions(records);
  await Promise.all(records.map((record) => window.hiveryn.session.subscribe(record.id)));
  return records.map((record) => record.id).filter((id) => !known.has(id));
}
