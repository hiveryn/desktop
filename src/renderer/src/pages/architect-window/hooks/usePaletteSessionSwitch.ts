import { useEffect } from 'react';
import { useSessionStore } from '../../../state/sessionStore';

const RETRY_INTERVAL_MS = 200;
const MAX_RETRIES = 25;

// The command palette can target a session in a window that was just created —
// its store hasn't been populated yet by useSessionRestore/useArchitectData
// when this message arrives, so setActiveSession (which throws on a missing
// session) needs to wait for the session to show up. `sessionId === null`
// means "the architect's own session" (selecting the architect row itself,
// rather than one of its worker sessions).
export function usePaletteSessionSwitch(): void {
  useEffect(() => {
    let token = 0;
    const unsubscribe = window.hiveryn.palette.onSwitchSession((sessionId) => {
      // Bumping the token invalidates any retry loop still in flight from a
      // prior switch — without this, an older lookup can win a race and land
      // the window on a stale target after a newer selection was made.
      const myToken = ++token;
      let tries = 0;
      const tryActivate = (): void => {
        if (myToken !== token) return;
        const { sessions, setActiveSession } = useSessionStore.getState();
        const targetId =
          sessionId ?? Object.values(sessions).find((s) => s.type === 'architect')?.id ?? null;
        if (targetId && sessions[targetId]) {
          setActiveSession(targetId);
          return;
        }
        tries += 1;
        if (tries < MAX_RETRIES) setTimeout(tryActivate, RETRY_INTERVAL_MS);
      };
      tryActivate();
    });
    return () => {
      token += 1;
      unsubscribe();
    };
  }, []);
}
