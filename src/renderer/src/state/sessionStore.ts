import type { Intent, SessionEvent, SessionTab } from '@hiveryn/shared/domain';
import { create } from 'zustand';
import { focusIdForTab, tabIdOf } from './tabFocus';

export interface SessionRecord {
  id: string;
  type: 'architect' | 'ticket' | 'freeform';
  label: string;
  contextId: string;
  mainTerminalId: string;
  tabs: SessionTab[];
  // Live agent status (active | idle | waiting | stopped), driving the tab icon.
  // Undefined until seeded from the daemon or the first agent_status SSE event.
  status?: string;
}

const EVENTS_PER_SESSION_CAP = 500;

interface SessionState {
  sessions: Record<string, SessionRecord>;
  events: Record<string, SessionEvent[]>;
  // Which session is selected in the bottom tab bar.
  activeSessionId: string | null;
  // Which primary right-pane tab is shown. Split terminals are rendered beside
  // this selection and never become the active tab-bar tab.
  activeRightTab: string;
  // Last active right tab per session ID — restored on session switch.
  sessionRightTabs: Record<string, string>;
  // Which pane has keyboard focus. Values:
  // 'main-terminal' | 'right-kanban' | 'right-event-log' | 'right-terminal:{uuid}' | 'right-ticket'
  focusedPane: string;
  // Pane currently maximized (same value space as focusedPane), or null for normal split layout.
  // Derived from maximizedPanes for the active session — kept as a flat field so
  // components can select it directly without recomputing per render.
  maximizedPane: string | null;
  // Maximized pane per session ID. Maximize is scoped per architect session, so
  // switching sessions never carries one session's maximize state into another.
  maximizedPanes: Record<string, string | null>;
  // Pending agent intents awaiting the user's approval, keyed by intent id. A
  // session can have several open at once; the window-level intent center
  // renders every session's intents, so this is not scoped to the active one.
  pendingIntents: Record<string, Intent>;
}

interface SessionActions {
  registerSession(record: SessionRecord): void;
  reconcileSessions(records: SessionRecord[]): void;
  unregisterSession(id: string): void;
  updateSessionMainTerminal(id: string, mainTerminalId: string): void;
  setSessionStatus(id: string, status: string): void;
  setActiveSession(sessionId: string | null): void;
  setActiveRightTab(tab: string): void;
  setFocusedPane(pane: string): void;
  setMaximizedPane(pane: string | null): void;
  setSessionTabs(sessionId: string, tabs: SessionTab[]): void;
  appendEvent(event: SessionEvent): void;
  clearEventsForSession(sessionId: string): void;
  setPendingIntent(intent: Intent): void;
  clearPendingIntent(intentId: string): void;
  reset(): void;
}

export type SessionStore = SessionState & SessionActions;

const initialState: SessionState = {
  sessions: {},
  events: {},
  activeSessionId: null,
  activeRightTab: 'kanban',
  sessionRightTabs: {},
  focusedPane: 'main-terminal',
  maximizedPane: null,
  maximizedPanes: {},
  pendingIntents: {},
};

// Split terminals render beside their primary tab and never become a bar tab.
export function isSplitTerminalTab(tab: SessionTab): boolean {
  return tab.type === 'terminal' && tab.placement === 'split';
}

function primaryTabIds(session: SessionRecord): string[] {
  return session.tabs.filter((tab) => !isSplitTerminalTab(tab)).map(tabIdOf);
}

function normalizeSelection(
  sessions: Record<string, SessionRecord>,
  activeSessionId: string | null,
  activeRightTab: string,
  focusedPane: string,
  sessionRightTabs: Record<string, string>,
  maximizedPanes: Record<string, string | null>,
): Pick<SessionState, 'activeSessionId' | 'activeRightTab' | 'focusedPane' | 'maximizedPane'> {
  const ordered = Object.values(sessions);
  const nextActiveSessionId =
    (activeSessionId && sessions[activeSessionId] ? activeSessionId : null) ??
    ordered.find((session) => session.type === 'architect')?.id ??
    ordered[0]?.id ??
    null;

  if (!nextActiveSessionId) {
    return {
      activeSessionId: null,
      activeRightTab: 'event-log',
      focusedPane: 'main-terminal',
      maximizedPane: null,
    };
  }

  const session = sessions[nextActiveSessionId];
  const validTabs = primaryTabIds(session);
  const candidate = sessionRightTabs[nextActiveSessionId] ?? activeRightTab;
  const nextActiveRightTab = validTabs.includes(candidate) ? candidate : validTabs[0];
  if (!nextActiveRightTab) {
    throw new Error(`Session ${session.id} returned no primary tabs`);
  }

  const focusedSplitTerminal =
    focusedPane.startsWith('right-terminal:') &&
    session.tabs.some(
      (tab) => isSplitTerminalTab(tab) && `right-terminal:${tab.id}` === focusedPane,
    );

  return {
    activeSessionId: nextActiveSessionId,
    activeRightTab: nextActiveRightTab,
    focusedPane:
      focusedPane === 'main-terminal'
        ? 'main-terminal'
        : focusedSplitTerminal
          ? focusedPane
          : focusIdForTab(nextActiveRightTab, session.tabs),
    maximizedPane: maximizedPanes[nextActiveSessionId] ?? null,
  };
}

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialState,

  registerSession(record) {
    set((state) => ({
      sessions: { ...state.sessions, [record.id]: record },
    }));
  },

  reconcileSessions(records) {
    set((state) => {
      const sessions = Object.fromEntries(records.map((record) => [record.id, record]));
      const events = Object.fromEntries(
        Object.entries(state.events).filter(([sessionId]) => sessionId in sessions),
      );
      const sessionRightTabs = Object.fromEntries(
        Object.entries(state.sessionRightTabs).filter(([id]) => id in sessions),
      );
      const pendingIntents = Object.fromEntries(
        Object.entries(state.pendingIntents).filter(
          ([, intent]) => intent.origin.session_id in sessions,
        ),
      );
      const maximizedPanes = Object.fromEntries(
        Object.entries(state.maximizedPanes).filter(([id]) => id in sessions),
      );
      return {
        sessions,
        events,
        sessionRightTabs,
        pendingIntents,
        maximizedPanes,
        ...normalizeSelection(
          sessions,
          state.activeSessionId,
          state.activeRightTab,
          state.focusedPane,
          sessionRightTabs,
          maximizedPanes,
        ),
      };
    });
  },

  unregisterSession(id) {
    set((state) => {
      if (!state.sessions[id]) return state;
      const { [id]: _removed, ...sessions } = state.sessions;
      const { [id]: _removedEvents, ...events } = state.events;
      const { [id]: _removedRightTab, ...sessionRightTabs } = state.sessionRightTabs;
      const pendingIntents = Object.fromEntries(
        Object.entries(state.pendingIntents).filter(
          ([, intent]) => intent.origin.session_id !== id,
        ),
      );
      const { [id]: _removedMaximized, ...maximizedPanes } = state.maximizedPanes;
      return {
        sessions,
        events,
        sessionRightTabs,
        pendingIntents,
        maximizedPanes,
        ...normalizeSelection(
          sessions,
          state.activeSessionId,
          state.activeRightTab,
          state.focusedPane,
          sessionRightTabs,
          maximizedPanes,
        ),
      };
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

  setSessionStatus(id, status) {
    set((state) => {
      const session = state.sessions[id];
      if (!session) {
        throw new Error(`Cannot set agent status for missing session ${id}`);
      }
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            status,
          },
        },
      };
    });
  },

  setActiveSession(sessionId) {
    set((state) => {
      if (!sessionId) return { activeSessionId: null };
      const session = state.sessions[sessionId];
      if (!session) throw new Error(`Cannot switch to missing session ${sessionId}`);
      const validTabIds = primaryTabIds(session);
      const savedTab = state.sessionRightTabs[sessionId];
      const nextTab = savedTab && validTabIds.includes(savedTab) ? savedTab : validTabIds[0];
      if (!nextTab) throw new Error(`Session ${sessionId} has no primary tabs`);
      return {
        activeSessionId: sessionId,
        activeRightTab: nextTab,
        maximizedPane: state.maximizedPanes[sessionId] ?? null,
      };
    });
  },

  setActiveRightTab(tab) {
    set((state) => {
      if (!state.activeSessionId) return { activeRightTab: tab };
      // A split renders beside its base tab; selecting it would fall back to
      // the first tab and persist that invalid selection for the session.
      const session = state.sessions[state.activeSessionId];
      if (
        session?.tabs.some((candidate) => isSplitTerminalTab(candidate) && candidate.id === tab)
      ) {
        throw new Error(`Cannot select split terminal ${tab} as the active right tab`);
      }
      return {
        activeRightTab: tab,
        sessionRightTabs: { ...state.sessionRightTabs, [state.activeSessionId]: tab },
      };
    });
  },

  setFocusedPane(pane) {
    set({ focusedPane: pane });
  },

  setMaximizedPane(pane) {
    set((state) => {
      if (!state.activeSessionId) return { maximizedPane: pane };
      return {
        maximizedPane: pane,
        maximizedPanes: { ...state.maximizedPanes, [state.activeSessionId]: pane },
      };
    });
  },

  setSessionTabs(sessionId, tabs) {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) {
        throw new Error(`Cannot update tabs for missing session ${sessionId}`);
      }
      const sessions = {
        ...state.sessions,
        [sessionId]: {
          ...session,
          tabs,
        },
      };
      return {
        sessions,
        ...normalizeSelection(
          sessions,
          state.activeSessionId,
          state.activeRightTab,
          state.focusedPane,
          state.sessionRightTabs,
          state.maximizedPanes,
        ),
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

  setPendingIntent(intent) {
    set((state) => ({
      pendingIntents: { ...state.pendingIntents, [intent.intent_id]: intent },
    }));
  },

  clearPendingIntent(intentId) {
    set((state) => {
      if (!state.pendingIntents[intentId]) return state;
      const { [intentId]: _removed, ...pendingIntents } = state.pendingIntents;
      return { pendingIntents };
    });
  },

  reset() {
    set(initialState);
  },
}));
