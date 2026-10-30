import { useEffect } from 'react';
import { STREAM_CONNECTED_EVENT_TYPE } from '../../../../../shared/types';
import { useArchitectStatusStore } from '../../../state/architectStatusStore';
import { useSessionStore } from '../../../state/sessionStore';
import { syncSessionsForArchitect } from './sessionSnapshot';

/**
 * Owns which sessions of one open project exist in the workbench.
 *
 * A session created outside the workbench's own Spawn action — an architect's
 * spawnTicketWorker — is only visible here because the daemon announces it on
 * the project's event stream. That stream is the only place a session id
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

    // Initial load. Deliberately does not auto-activate: on mount the project is
    // adopting sessions that already existed, not reacting to a new one.
    void syncSessionsForArchitect(architectKey);

    const unsubscribe = window.hiveryn.architects.subscribeEvents(architectKey, (event) => {
      if (event.type === STREAM_CONNECTED_EVENT_TYPE) {
        // Reconnect resync. Never steals focus — a dropped stream is not a
        // reason to move the user off the session they are working in.
        void syncSessionsForArchitect(architectKey);
        return;
      }

      // A companion's lifecycle, connection or pending action requests
      // changed: the sidebar reads companions from the status listing.
      if (event.reason === 'companion_changed') {
        void useArchitectStatusStore.getState().refresh();
        return;
      }

      if (event.reason !== 'session_started' && event.reason !== 'session_ended') {
        return;
      }

      // session_ended is a safety net, not the teardown path. Teardown is owned
      // by the session's own stream (`useSessionEvents`), which also disconnects
      // the socket; this only drops a session whose stream died without
      // delivering that event.
      // The two cannot meaningfully race: the daemon emits the session-scoped
      // event first, and it arrives on an already-open stream, while this path
      // has to complete two HTTP round-trips before it touches the store.

      void syncSessionsForArchitect(architectKey).then((appeared) => {
        if (cancelled || event.reason !== 'session_started') return;
        // Activate only a session that was genuinely absent before this sync.
        // A redelivered session_started must not yank the user back to a
        // session they have since switched away from.
        if (!appeared.includes(event.session_id)) return;
        const store = useSessionStore.getState();
        // A project in the background never takes the workspace: its new
        // session shows in the sidebar until the user selects it.
        if (store.selectedArchitectKey !== architectKey) return;
        // setActiveSession throws on an unknown id, and the session can legally
        // have ended between the sync and here.
        const session = store.sessions[event.session_id];
        if (!session) return;
        // Companions start on their own with each architect session; they
        // appear beneath it without taking the workspace from the architect.
        if (session.type === 'companion') return;
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
