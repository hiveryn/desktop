import { create } from 'zustand';
import type { SessionEvent } from '../../../shared/types';

export type TerminalStatus = 'connecting' | 'connected' | 'disconnected';

export interface TerminalRecord {
  sessionId: string;
  name: string;
  wsUrl: string;
  status: TerminalStatus;
}

export interface SessionRecord {
  id: string;
  type: 'architect' | 'work';
  label: string;
  ticketId?: string;
  terminals: Record<string, TerminalRecord>;
}

const EVENTS_PER_SESSION_CAP = 500;

interface SessionState {
  sessions: Record<string, SessionRecord>;
  events: Record<string, SessionEvent[]>;
  // Which session is selected in the bottom tab bar.
  activeSessionId: string | null;
  // Which right-pane tab is shown. 'kanban' | 'event-log' | 'terminal' | <terminal-name>.
  // 'terminal' is only used in compact mode (shows main terminal in the single pane).
  activeRightTab: string;
}

interface SessionActions {
  registerSession(record: SessionRecord): void;
  unregisterSession(id: string): void;
  setActiveSession(sessionId: string | null): void;
  setActiveRightTab(tab: string): void;
  addTerminal(sessionId: string, terminal: TerminalRecord): void;
  removeTerminal(sessionId: string, name: string): void;
  setTerminalStatus(sessionId: string, name: string, status: TerminalStatus): void;
  appendEvent(event: SessionEvent): void;
  clearEventsForSession(sessionId: string): void;
  reset(): void;
}

export type SessionStore = SessionState & SessionActions;

const initialState: SessionState = {
  sessions: {},
  events: {},
  activeSessionId: null,
  activeRightTab: 'kanban',
};

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialState,

  registerSession(record) {
    set((state) => ({
      sessions: { ...state.sessions, [record.id]: record },
    }));
  },

  unregisterSession(id) {
    set((state) => {
      if (!state.sessions[id]) return state;
      const { [id]: _removed, ...sessions } = state.sessions;
      const { [id]: _removedEvents, ...events } = state.events;
      const activeSessionId = state.activeSessionId === id ? null : state.activeSessionId;
      return { sessions, events, activeSessionId };
    });
  },

  setActiveSession(sessionId) {
    set({ activeSessionId: sessionId });
  },

  setActiveRightTab(tab) {
    set({ activeRightTab: tab });
  },

  addTerminal(sessionId, terminal) {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            terminals: { ...session.terminals, [terminal.name]: terminal },
          },
        },
      };
    });
  },

  removeTerminal(sessionId, name) {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session?.terminals[name]) return state;
      const { [name]: _removed, ...terminals } = session.terminals;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, terminals },
        },
      };
    });
  },

  setTerminalStatus(sessionId, name, status) {
    set((state) => {
      const session = state.sessions[sessionId];
      const terminal = session?.terminals[name];
      if (!terminal) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            terminals: {
              ...session.terminals,
              [name]: { ...terminal, status },
            },
          },
        },
      };
    });
  },

  appendEvent(event) {
    set((state) => {
      const existing = state.events[event.session_id] ?? [];
      const next =
        existing.length >= EVENTS_PER_SESSION_CAP
          ? [...existing.slice(existing.length - EVENTS_PER_SESSION_CAP + 1), event]
          : [...existing, event];
      return {
        events: { ...state.events, [event.session_id]: next },
      };
    });
  },

  clearEventsForSession(sessionId) {
    set((state) => {
      if (!state.events[sessionId]) return state;
      const { [sessionId]: _removed, ...events } = state.events;
      return { events };
    });
  },

  reset() {
    set(initialState);
  },
}));
