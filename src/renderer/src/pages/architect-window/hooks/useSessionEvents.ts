import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../../state/sessionStore';

export interface ConcludedSession {
  sessionId: string;
  sessionType: 'architect' | 'work';
  conclusionBody: string;
  commits?: string[];
  rejected?: boolean;
  rejectionReason?: string;
}

interface RawConclusion {
  body?: string;
  commits?: string[];
  rejected?: boolean;
  rejection_reason?: string;
}

export function useSessionEvents(): {
  concludedSession: ConcludedSession | null;
  dismissConcludedSession(): void;
} {
  const [concludedSession, setConcludedSession] = useState<ConcludedSession | null>(null);
  const concludedRef = useRef(concludedSession);
  concludedRef.current = concludedSession;

  useEffect(() => {
    return window.hiveryn.session.onEvent((event) => {
      useSessionStore.getState().appendEvent(event);

      if (event.type !== 'status' || event.status !== 'ended') return;
      if (concludedRef.current) return;

      const session = useSessionStore.getState().sessions[event.session_id];
      if (!session) return;

      const raw = event.raw as RawConclusion | undefined;
      setConcludedSession({
        sessionId: event.session_id,
        sessionType: session.type,
        conclusionBody: raw?.body ?? 'Session concluded',
        commits: raw?.commits,
        rejected: raw?.rejected,
        rejectionReason: raw?.rejection_reason,
      });
    });
  }, []);

  const dismissConcludedSession = useCallback(() => setConcludedSession(null), []);

  return { concludedSession, dismissConcludedSession };
}
