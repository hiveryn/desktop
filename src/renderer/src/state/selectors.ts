import type { SessionEvent } from '@hiveryn/shared/domain';
import { useShallow } from 'zustand/react/shallow';
import { type SessionRecord, type SessionStore, useSessionStore } from './sessionStore';

// Stable empty references — returned when there's no matching data so the
// selector doesn't produce a fresh array on every render (which would loop
// useSyncExternalStore).
const EMPTY_EVENTS: SessionEvent[] = [];
const EMPTY_SESSIONS: SessionRecord[] = [];

export function useArchitectSession(): SessionRecord | undefined {
  return useSessionStore((s) => {
    for (const session of Object.values(s.sessions)) {
      if (session.type === 'architect') return session;
    }
    return undefined;
  });
}

export function useTicketSessions(): SessionRecord[] {
  return useSessionStore(
    useShallow((s) => {
      const result = Object.values(s.sessions).filter((session) => session.type === 'ticket');
      return result.length === 0 ? EMPTY_SESSIONS : result;
    }),
  );
}

export function useActiveSession(): SessionRecord | undefined {
  return useSessionStore((s) => (s.activeSessionId ? s.sessions[s.activeSessionId] : undefined));
}

export function useEventsForActiveSession(): SessionEvent[] {
  return useSessionStore((s) => {
    if (!s.activeSessionId) return EMPTY_EVENTS;
    return s.events[s.activeSessionId] ?? EMPTY_EVENTS;
  });
}

export function useEventsForSession(sessionId: string): SessionEvent[] {
  return useSessionStore((s) => s.events[sessionId] ?? EMPTY_EVENTS);
}

export const getStoreSnapshot = (): SessionStore => useSessionStore.getState();
