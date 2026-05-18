import { create } from 'zustand';
import type { SessionEvent, SessionTab } from '../../../shared/types';

export interface SessionRecord {
  id: string;
  type: 'architect' | 'work';
  label: string;
  ticketId?: string;
  mainTerminalId: string;
  tabs: SessionTab[];
}

const EVENTS_PER_SESSION_CAP = 500;

interface SessionState {
  sessions: Record<string, SessionRecord>;
  events: Record<string, SessionEvent[]>;
  // Which session is selected in the bottom tab bar.
  activeSessionId: string | null;
  // Which right-pane tab is shown. 'kanban' | 'event-log' | <terminal-uuid>.
  activeRightTab: string;
  // Which pane has keyboard focus. Values:
  // 'main-terminal' | 'right-kanban' | 'right-event-log' | 'right-terminal:{uuid}'
  focusedPane: string;
}

interface SessionActions {
  registerSession(record: SessionRecord): void;
  unregisterSession(id: string): void;
  updateSessionMainTerminal(id: string, mainTerminalId: string): void;
  setActiveSession(sessionId: string | null): void;
  setActiveRightTab(tab: string): void;
  setFocusedPane(pane: string): void;
  setSessionTabs(sessionId: string, tabs: SessionTab[]): void;
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
  focusedPane: 'main-terminal',
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

  updateSessionMainTerminal(id, mainTerminalId) {
    set((state) => {
      const session = state.sessions[id];
      if (!session) {
        throw new Error(`Cannot update main terminal for missing session ${id}`);
      }
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            mainTerminalId,
          },
        },
      };
    });
  },

  setActiveSession(sessionId) {
    set({ activeSessionId: sessionId });
  },

  setActiveRightTab(tab) {
    set({ activeRightTab: tab });
  },

  setFocusedPane(pane) {
    set({ focusedPane: pane });
  },

  setSessionTabs(sessionId, tabs) {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            tabs,
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
