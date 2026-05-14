import { useShallow } from 'zustand/react/shallow';
import type { SessionEvent } from '../../../shared/types';
import {
  type SessionRecord,
  type SessionStore,
  type TerminalRecord,
  useSessionStore,
} from './sessionStore';

// Stable empty references — returned when there's no matching data so the
// selector doesn't produce a fresh array on every render (which would loop
// useSyncExternalStore).
const EMPTY_EVENTS: SessionEvent[] = [];
const EMPTY_TERMINALS: TerminalRecord[] = [];
const EMPTY_SESSIONS: SessionRecord[] = [];

export function useArchitectSession(): SessionRecord | undefined {
  return useSessionStore((s) => {
    for (const session of Object.values(s.sessions)) {
      if (session.type === 'architect') return session;
    }
    return undefined;
  });
}

export function useWorkSessions(): SessionRecord[] {
  return useSessionStore(
    useShallow((s) => {
      const result = Object.values(s.sessions).filter((session) => session.type === 'work');
      return result.length === 0 ? EMPTY_SESSIONS : result;
    }),
  );
}

export function useActiveSession(): SessionRecord | undefined {
  return useSessionStore((s) => (s.activeSessionId ? s.sessions[s.activeSessionId] : undefined));
}

export function useExtraTerminalsForActiveSession(): TerminalRecord[] {
  return useSessionStore(
    useShallow((s) => {
      if (!s.activeSessionId) return EMPTY_TERMINALS;
      const session = s.sessions[s.activeSessionId];
      if (!session) return EMPTY_TERMINALS;
      const extras = Object.values(session.terminals).filter((t) => t.name !== 'main');
      return extras.length === 0 ? EMPTY_TERMINALS : extras;
    }),
  );
}

export function useEventsForActiveSession(): SessionEvent[] {
  return useSessionStore((s) => {
    if (!s.activeSessionId) return EMPTY_EVENTS;
    return s.events[s.activeSessionId] ?? EMPTY_EVENTS;
  });
}

export const getStoreSnapshot = (): SessionStore => useSessionStore.getState();
