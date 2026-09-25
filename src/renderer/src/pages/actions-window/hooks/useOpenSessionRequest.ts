import { useEffect, useRef } from 'react';
import { useErrorCenterStore } from '../../../state/errorCenterStore';
import { useSessionStore } from '../../../state/sessionStore';

const RETRY_INTERVAL_MS = 200;
const MAX_RETRIES = 25;

/**
 * Lands the window on an execution's session tab when the command palette
 * asks for it. The request can reach a window that was just created, before
 * its first sync has registered the session, so it waits for the session to
 * appear; one refresh is requested up front in case the execution started
 * after the last sync. A newer request supersedes any still waiting.
 */
export function useOpenSessionRequest(
  openSession: (sessionId: string) => void,
  refresh: () => Promise<void>,
): void {
  const openRef = useRef(openSession);
  const refreshRef = useRef(refresh);
  openRef.current = openSession;
  refreshRef.current = refresh;

  useEffect(() => {
    let token = 0;
    const unsubscribe = window.hiveryn.actions.onOpenSession((sessionId) => {
      const myToken = ++token;
      let tries = 0;
      const tryOpen = (): void => {
        if (myToken !== token) return;
        const { sessions } = useSessionStore.getState();
        if (sessions[sessionId]) {
          openRef.current(sessionId);
          return;
        }
        if (tries === 0) void refreshRef.current();
        tries += 1;
        if (tries < MAX_RETRIES) {
          setTimeout(tryOpen, RETRY_INTERVAL_MS);
          return;
        }
        // The palette listed this execution as running, so a session that
        // never shows up here means discovery missed it (or it ended in the
        // meantime) — surface it rather than silently staying put.
        useErrorCenterStore.getState().pushError({
          title: 'Open action session',
          message: `Action session ${sessionId} did not appear in the Actions window after ${(MAX_RETRIES * RETRY_INTERVAL_MS) / 1000}s; it may have ended`,
          timestamp: Date.now(),
          details: { requested_session_id: sessionId, known_session_ids: Object.keys(sessions) },
        });
      };
      tryOpen();
    });
    return () => {
      token += 1;
      unsubscribe();
    };
  }, []);
}
