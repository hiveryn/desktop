import { useErrorCenterStore } from '../../state/errorCenterStore';
import { useSessionStore } from '../../state/sessionStore';
import { syncSessionsForArchitect } from './hooks/sessionSnapshot';

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
 * through one discovery sync of that project.
 */
export async function selectSession(architectKey: string, sessionId: string): Promise<void> {
  const store = useSessionStore.getState();
  if (store.sessions[sessionId]) {
    store.setActiveSession(sessionId);
    return;
  }
  store.selectArchitect(architectKey);
  const epoch = useSessionStore.getState().selectionEpoch;
  await syncSessionsForArchitect(architectKey);
  const current = useSessionStore.getState();
  if (current.selectionEpoch !== epoch) return;
  if (current.sessions[sessionId]) {
    current.setActiveSession(sessionId);
    return;
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
