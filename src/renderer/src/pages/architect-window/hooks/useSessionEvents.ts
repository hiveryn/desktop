import { useEffect, useRef } from 'react';
import { useSessionStore } from '../../../state/sessionStore';

async function cleanupEndedSession(
  sessionId: string,
  sessionType: 'architect' | 'work',
): Promise<void> {
  await window.hiveryn.session.disconnect(sessionId);

  const store = useSessionStore.getState();
  const architectId =
    Object.values(store.sessions).find(
      (session) => session.type === 'architect' && session.id !== sessionId,
    )?.id ?? null;

  store.unregisterSession(sessionId);

  if (sessionType === 'architect') {
    await window.hiveryn.architect.closeWindow();
    return;
  }

  store.setActiveSession(architectId);
  store.setActiveRightTab(architectId ? 'kanban' : 'event-log');
  store.setFocusedPane(architectId ? 'main-terminal' : 'right-event-log');
}

export function useSessionEvents(): void {
  const endingSessionIdsRef = useRef(new Set<string>());

  useEffect(() => {
    return window.hiveryn.session.onEvent((event) => {
      const store = useSessionStore.getState();
      store.appendEvent(event);

      if (event.type !== 'status' || event.status !== 'ended') return;
      if (endingSessionIdsRef.current.has(event.session_id)) return;

      const session = store.sessions[event.session_id];
      if (!session) return;

      endingSessionIdsRef.current.add(event.session_id);
      void cleanupEndedSession(event.session_id, session.type);
    });
  }, []);
}
