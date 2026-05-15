import { SessionConcludedDialog } from '@hiveryn/components';
import { useSessionStore } from '../../../state/sessionStore';
import type { ConcludedSession } from '../hooks/useSessionEvents';

interface Props {
  concludedSession: ConcludedSession | null;
  onDismiss(): void;
}

export default function ConcludedSessionFlow({ concludedSession, onDismiss }: Props) {
  if (!concludedSession) return null;

  return (
    <SessionConcludedDialog
      sessionType={concludedSession.sessionType}
      conclusionBody={concludedSession.conclusionBody}
      commits={concludedSession.commits}
      rejected={concludedSession.rejected}
      rejectionReason={concludedSession.rejectionReason}
      timerSeconds={5}
      onComplete={() => {
        const { sessionId, sessionType } = concludedSession;

        void window.hiveryn.session.disconnect(sessionId).catch(() => {});

        if (sessionType === 'architect') {
          void window.hiveryn.architect.closeWindow().catch(() => {});
        } else {
          const store = useSessionStore.getState();
          store.unregisterSession(sessionId);
          const architect = Object.values(store.sessions).find((s) => s.type === 'architect');
          store.setActiveSession(architect?.id ?? null);
          store.setActiveRightTab(architect ? 'kanban' : 'event-log');
        }

        onDismiss();
      }}
    />
  );
}
