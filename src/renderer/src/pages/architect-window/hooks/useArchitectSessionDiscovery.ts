import { useEffect } from 'react';
import { STREAM_CONNECTED_EVENT_TYPE } from '../../../../../shared/types';
import { useSessionStore } from '../../../state/sessionStore';
import { syncSessionsForArchitect } from './sessionSnapshot';

/**
 * Owns which sessions exist in this architect window.
 *
 * A session created outside this window's own Spawn action — a spawn from
 * another architect window — is only visible here because the daemon announces
 * it on the architect event stream. That stream is the only place a session id
 * appears before the client knows the session exists; the per-session stream
 * cannot help, since subscribing to it already requires the id.
 *
 * The stream has no backlog, so live delivery alone is not enough: the main
 * process synthesizes `stream_connected` on every (re)connect, and that resyncs
 * whatever was missed while disconnected.
 */
export function useArchitectSessionDiscovery(architectKey: string): void {
  useEffect(() => {
    if (!architectKey) return;
    let cancelled = false;

    // Initial load. Deliberately does not auto-activate: on mount the window is
    // adopting sessions that already existed, not reacting to a new one.
    void syncSessionsForArchitect(architectKey);

    const unsubscribe = window.hiveryn.architects.subscribeEvents(architectKey, (event) => {
      if (event.type === STREAM_CONNECTED_EVENT_TYPE) {
        // Reconnect resync. Never steals focus — a dropped stream is not a
        // reason to move the user off the session they are working in.
        void syncSessionsForArchitect(architectKey);
        return;
      }

      if (event.reason !== 'session_started' && event.reason !== 'session_ended') {
        return;
      }

      // session_ended is a safety net, not the teardown path. Teardown is owned
      // by the session's own stream (`useSessionEvents`), which also disconnects
      // the socket and closes the window for an architect session; this only
      // drops a tab whose session stream died without delivering that event.
      // The two cannot meaningfully race: the daemon emits the session-scoped
      // event first, and it arrives on an already-open stream, while this path
      // has to complete two HTTP round-trips before it touches the store.

      void syncSessionsForArchitect(architectKey).then((appeared) => {
        if (cancelled || event.reason !== 'session_started') return;
        // Activate only a session that was genuinely absent before this sync.
        // A redelivered session_started must not yank the user back to a tab
        // they have since switched away from.
        if (!appeared.includes(event.session_id)) return;
        const store = useSessionStore.getState();
        // setActiveSession throws on an unknown id, and the session can legally
        // have ended between the sync and here.
        if (!store.sessions[event.session_id]) return;
        store.setActiveSession(event.session_id);
        store.setFocusedPane('main-terminal');
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [architectKey]);
}
