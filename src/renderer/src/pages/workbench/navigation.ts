import { useArchitectStatusStore } from '../../state/architectStatusStore';
import { useErrorCenterStore } from '../../state/errorCenterStore';
import { useSessionStore } from '../../state/sessionStore';
import { syncSessionsForArchitect } from './hooks/sessionSnapshot';
import { cycleOrder, cycleTarget } from './sidebar/rows';

// Selection requests that may have to wait for the daemon. Every explicit
// selection bumps the store's selectionEpoch, so a request that is still
// waiting gives up when the user has selected something newer meanwhile — a
// late sync or a delayed notification click never replaces a newer selection.

/** Shows a project: its last shown session, else its architect session. */
export function selectArchitect(architectKey: string): void {
  useSessionStore.getState().selectArchitect(architectKey);
}

/**
 * Shows a session of a project. A session the workbench does not know yet (its
 * project was never opened, or discovery has not caught up) is waited for
 * through one discovery sync of that project. Resolves true once the session is
 * shown; false when a newer selection won meanwhile or the session is not
 * running (reported to the error center).
 */
export async function selectSession(architectKey: string, sessionId: string): Promise<boolean> {
  const store = useSessionStore.getState();
  if (store.sessions[sessionId]) {
    store.setActiveSession(sessionId);
    return true;
  }
  store.selectArchitect(architectKey);
  const epoch = useSessionStore.getState().selectionEpoch;
  await syncSessionsForArchitect(architectKey);
  const current = useSessionStore.getState();
  if (current.selectionEpoch !== epoch) return false;
  if (current.sessions[sessionId]) {
    current.setActiveSession(sessionId);
    return true;
  }
  useErrorCenterStore.getState().pushError({
    title: 'Session switch',
    message: `Session ${sessionId} of ${architectKey} is not running`,
    timestamp: Date.now(),
    details: {
      architect_key: architectKey,
      requested_session_id: sessionId,
      known_session_ids: Object.keys(current.sessions),
    },
  });
  return false;
}

// The target of the last cycling step while its selection is still the newest
// one (same epoch): rapid presses chain from it even while a session of an
// unopened project is still being discovered.
let cycleCursor: { sessionId: string; epoch: number } | null = null;

/**
 * Steps through every running architect and worker session across projects in
 * the unfiltered sidebar order, wrapping at both ends (global prev/next-session).
 */
export async function cycleSession(delta: 1 | -1): Promise<void> {
  const store = useSessionStore.getState();
  const current =
    cycleCursor && cycleCursor.epoch === store.selectionEpoch
      ? cycleCursor.sessionId
      : store.activeSessionId;
  const target = cycleTarget(
    cycleOrder(useArchitectStatusStore.getState().statuses),
    current,
    delta,
  );
  if (!target) return;
  const shown = selectSession(target.architectKey, target.sessionId);
  cycleCursor = { sessionId: target.sessionId, epoch: useSessionStore.getState().selectionEpoch };
  if (!(await shown)) return;
  const after = useSessionStore.getState();
  if (after.activeSessionId === target.sessionId) after.setFocusedPane('main-terminal');
}

/**
 * Activates a session the workbench itself just launched, unless the user has
 * selected something else since `epoch` (a launch can take minutes).
 */
export function activateLaunchedSession(sessionId: string, epoch: number): void {
  const store = useSessionStore.getState();
  if (store.selectionEpoch !== epoch || !store.sessions[sessionId]) return;
  store.setActiveSession(sessionId);
  store.setFocusedPane('main-terminal');
}
