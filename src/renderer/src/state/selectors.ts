import type { SessionEvent } from '@hiveryn/shared/domain';
import { useSessionStore } from './sessionStore';

// Stable empty reference — returned when there's no matching data so the
// selector doesn't produce a fresh array on every render (which would loop
// useSyncExternalStore).
const EMPTY_EVENTS: SessionEvent[] = [];

export function useEventsForActiveSession(): SessionEvent[] {
  return useSessionStore((s) => {
    if (!s.activeSessionId) return EMPTY_EVENTS;
    return s.events[s.activeSessionId] ?? EMPTY_EVENTS;
  });
}

export function useEventsForSession(sessionId: string): SessionEvent[] {
  return useSessionStore((s) => s.events[sessionId] ?? EMPTY_EVENTS);
}
