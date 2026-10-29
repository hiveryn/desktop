import type {
  AgentQuestion,
  Intent,
  QuestionAnswerSource,
  QuestionStatus,
  SessionEvent,
  SessionTab,
  SessionType,
} from '@hiveryn/shared/domain';
import { create } from 'zustand';
import { focusIdForTab, tabIdOf } from './tabFocus';

export interface SessionRecord {
  // The project (architect key) the session belongs to.
  architectKey: string;
  interactionMode?: 'terminal' | 'chat';
  machine?: string;
  connection?: string;
  connectionMessage?: string;
  id: string;
  type: SessionType;
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
  // Running sessions of every project opened in this window, keyed by id.
  sessions: Record<string, SessionRecord>;
  events: Record<string, SessionEvent[]>;
  // The project shown in the workspace, or null for none (the launcher view).
  selectedArchitectKey: string | null;
  // Projects whose sessions this window discovers and keeps connected: every
  // project selected since the window opened. Sessions of other projects stay
  // registered (terminals keep their scrollback) while another one is shown.
  openArchitects: string[];
  // Which session the workspace shows. Always one of the selected project's
  // sessions, or null when that project has none running.
  activeSessionId: string | null;
  // Last shown session per project — restored when the project is selected again.
  projectSessions: Record<string, string>;
  // Bumped by every explicit selection (selectArchitect / setActiveSession). An
  // async selection request compares it to know whether the user has selected
  // something newer meanwhile; reconciles and fallbacks never bump it.
  selectionEpoch: number;
  // Which right-pane tab is shown.
  activeRightTab: string;
  // Last active right tab per session ID — restored on session switch.
  sessionRightTabs: Record<string, string>;
  // Which pane has keyboard focus. Values:
  // 'main-terminal' | 'right-kanban' | 'right-event-log' | 'right-terminal:{uuid}' | 'right-ticket'
  focusedPane: string;
  // Last focused pane per session ID — restored on session switch.
  sessionFocusedPanes: Record<string, string>;
  // Pane currently maximized (same value space as focusedPane), or null for the normal layout.
  // Derived from maximizedPanes for the active session — kept as a flat field so
  // components can select it directly without recomputing per render.
  maximizedPane: string | null;
  // Maximized pane per session ID. Maximize is scoped per architect session, so
  // switching sessions never carries one session's maximize state into another.
  maximizedPanes: Record<string, string | null>;
  // Pending agent intents awaiting the user's approval, keyed by intent id. A
  // session can have several open at once; the intent center renders every
  // intent of the selected project, so this is not scoped to the active session.
  pendingIntents: Record<string, PendingIntent>;
  // Agent questions keyed by question id, across all sessions. A question is
  // pending until the daemon resolves it; a resolution the user should see
  // (expired, cancelled, interrupted) is kept as a notice until dismissed.
  // The workspace renders only the questions of the session it shows.
  questions: Record<string, QuestionEntry>;
}

// An intent card's view state. resolving: the intent was approved (by the
// user or its policy) and the daemon is running it — no longer answerable, not
// yet resolved. failure: it resolved with an error the user should read; the
// card stays as a notice until dismissed.
export interface PendingIntent extends Intent {
  resolving?: boolean;
  failure?: string;
}

export interface QuestionEntry extends AgentQuestion {
  // Collapsed to a one-line reminder by the user; never answers anything.
  minimized?: boolean;
}

export interface QuestionResolution {
  question_id: string;
  status: QuestionStatus;
  answer?: string;
  // Who gave the answer (status answered): the user, or the project architect
  // for an escalated worker question.
  answered_by?: QuestionAnswerSource;
  reason?: string;
}

interface SessionActions {
  registerSession(record: SessionRecord): void;
  // Replaces one project's sessions with a fresh daemon snapshot; other
  // projects' sessions are untouched.
  reconcileArchitectSessions(architectKey: string, records: SessionRecord[]): void;
  unregisterSession(id: string): void;
  updateSessionMainTerminal(id: string, mainTerminalId: string): void;
  setSessionStatus(id: string, status: string): void;
  setSessionConnection(id: string, connection: string, message?: string): void;
  // Shows a project (opening it), on its last shown session.
  selectArchitect(architectKey: string): void;
  // Shows a session, selecting its project.
  setActiveSession(sessionId: string): void;
  setActiveRightTab(tab: string): void;
  setFocusedPane(pane: string): void;
  setMaximizedPane(pane: string | null): void;
  setSessionTabs(sessionId: string, tabs: SessionTab[]): void;
  appendEvent(event: SessionEvent): void;
  clearEventsForSession(sessionId: string): void;
  setPendingIntent(intent: Intent): void;
  clearPendingIntent(intentId: string): void;
  markIntentResolving(intentId: string): void;
  failPendingIntent(intentId: string, reason: string): void;
  setQuestion(question: AgentQuestion): void;
  // keepNotice: keep the question as a no-longer-answerable notice instead of
  // removing it.
  resolveQuestion(resolution: QuestionResolution, keepNotice: boolean): void;
  dismissQuestion(questionId: string): void;
  setQuestionMinimized(questionId: string, minimized: boolean): void;
  reset(): void;
}

export type SessionStore = SessionState & SessionActions;

const initialState: SessionState = {
  sessions: {},
  events: {},
  selectedArchitectKey: null,
  openArchitects: [],
  activeSessionId: null,
  projectSessions: {},
  selectionEpoch: 0,
  activeRightTab: 'kanban',
  sessionRightTabs: {},
  focusedPane: 'main-terminal',
  sessionFocusedPanes: {},
  maximizedPane: null,
  maximizedPanes: {},
  pendingIntents: {},
  questions: {},
};

type Selection = Pick<
  SessionState,
  'activeSessionId' | 'activeRightTab' | 'focusedPane' | 'maximizedPane'
>;

// The session to show for a project: the one last shown, else its architect
// session, else its first worker. Never another project's session.
export function projectSessionFor(
  sessions: Record<string, SessionRecord>,
  architectKey: string,
  remembered: string | undefined,
): string | null {
  if (remembered && sessions[remembered]?.architectKey === architectKey) return remembered;
  const own = Object.values(sessions).filter((session) => session.architectKey === architectKey);
  return (own.find((session) => session.type === 'architect') ?? own[0])?.id ?? null;
}

// The view state for showing `sessionId` (or nothing): its saved right tab,
// focused pane and maximize state.
function selectionFor(
  state: Pick<
    SessionState,
    'sessions' | 'sessionRightTabs' | 'sessionFocusedPanes' | 'maximizedPanes'
  >,
  sessionId: string | null,
): Selection {
  if (!sessionId) {
    return {
      activeSessionId: null,
      activeRightTab: 'event-log',
      focusedPane: 'main-terminal',
      maximizedPane: null,
    };
  }
  const session = state.sessions[sessionId];
  if (!session) throw new Error(`Cannot switch to missing session ${sessionId}`);
  // The session's own last tab, else its first: another session's tab never
  // carries over.
  const validTabs = session.tabs.map(tabIdOf);
  const remembered = state.sessionRightTabs[sessionId];
  const activeRightTab = remembered && validTabs.includes(remembered) ? remembered : validTabs[0];
  if (!activeRightTab) {
    throw new Error(`Session ${session.id} returned no right-pane tabs`);
  }
  const saved = state.sessionFocusedPanes[sessionId] ?? 'main-terminal';
  const focusedPane =
    saved === 'main-terminal' || validTabs.some((tab) => focusIdForTab(tab) === saved)
      ? saved
      : 'main-terminal';
  return {
    activeSessionId: sessionId,
    activeRightTab,
    focusedPane,
    maximizedPane: state.maximizedPanes[sessionId] ?? null,
  };
}

// Re-derives the selection after the session map changed. The active session
// stays when it still exists; otherwise the selected project falls back to
// another of its own sessions — a session ending never moves the workspace to
// another project.
function normalizeSelection(
  state: Pick<
    SessionState,
    | 'sessions'
    | 'selectedArchitectKey'
    | 'activeSessionId'
    | 'activeRightTab'
    | 'focusedPane'
    | 'projectSessions'
    | 'sessionRightTabs'
    | 'sessionFocusedPanes'
    | 'maximizedPanes'
  >,
): Selection {
  const { sessions, selectedArchitectKey, activeSessionId } = state;
  const current = activeSessionId ? sessions[activeSessionId] : undefined;
  if (current && current.architectKey === selectedArchitectKey) {
    // Same session: keep the live focus, only re-validate the right tab.
    const validTabs = current.tabs.map(tabIdOf);
    const candidate = state.sessionRightTabs[current.id] ?? state.activeRightTab;
    const activeRightTab = validTabs.includes(candidate) ? candidate : validTabs[0];
    if (!activeRightTab) {
      throw new Error(`Session ${current.id} returned no right-pane tabs`);
    }
    return {
      activeSessionId: current.id,
      activeRightTab,
      focusedPane:
        state.focusedPane === 'main-terminal' ? 'main-terminal' : focusIdForTab(activeRightTab),
      maximizedPane: state.maximizedPanes[current.id] ?? null,
    };
  }
  const next = selectedArchitectKey
    ? projectSessionFor(sessions, selectedArchitectKey, state.projectSessions[selectedArchitectKey])
    : null;
  return selectionFor(state, next);
}

// Drops per-session view state of sessions that no longer exist.
function retainSessions<T>(record: Record<string, T>, sessions: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id in sessions));
}

// The state after the session map changed: per-session view state and
// cross-session records of removed sessions are dropped and the selection is
// re-derived. A remembered project session survives only while it runs.
function withSessions(
  state: SessionState,
  sessions: Record<string, SessionRecord>,
): Partial<SessionState> {
  const events = retainSessions(state.events, sessions);
  const sessionRightTabs = retainSessions(state.sessionRightTabs, sessions);
  const sessionFocusedPanes = retainSessions(state.sessionFocusedPanes, sessions);
  const maximizedPanes = retainSessions(state.maximizedPanes, sessions);
  const projectSessions = Object.fromEntries(
    Object.entries(state.projectSessions).filter(([, id]) => id in sessions),
  );
  const pendingIntents = Object.fromEntries(
    Object.entries(state.pendingIntents).filter(
      ([, intent]) => intent.origin.session_id in sessions,
    ),
  );
  const questions = Object.fromEntries(
    Object.entries(state.questions).filter(([, q]) => q.origin.session_id in sessions),
  );
  const next = {
    ...state,
    sessions,
    events,
    sessionRightTabs,
    sessionFocusedPanes,
    maximizedPanes,
    projectSessions,
  };
  return {
    sessions,
    events,
    sessionRightTabs,
    sessionFocusedPanes,
    maximizedPanes,
    projectSessions,
    pendingIntents,
    questions,
    ...normalizeSelection(next),
  };
}

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialState,

  registerSession(record) {
    set((state) => {
      const sessions = { ...state.sessions, [record.id]: record };
      return { sessions, ...normalizeSelection({ ...state, sessions }) };
    });
  },

  reconcileArchitectSessions(architectKey, records) {
    set((state) => {
      for (const record of records) {
        if (record.architectKey !== architectKey) {
          throw new Error(
            `Session ${record.id} of ${record.architectKey} reconciled as ${architectKey}`,
          );
        }
      }
      const sessions = Object.fromEntries([
        ...Object.entries(state.sessions).filter(
          ([, session]) => session.architectKey !== architectKey,
        ),
        ...records.map((record) => [record.id, record] as const),
      ]);
      return withSessions(state, sessions);
    });
  },

  unregisterSession(id) {
    set((state) => {
      if (!state.sessions[id]) return state;
      const { [id]: _removed, ...sessions } = state.sessions;
      return withSessions(state, sessions);
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

  setSessionConnection(id, connection, connectionMessage) {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            connection,
            connectionMessage,
            status: connection === 'connected' ? session.status : undefined,
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
            status: session.connection && session.connection !== 'connected' ? undefined : status,
          },
        },
      };
    });
  },

  selectArchitect(architectKey) {
    set((state) => {
      const sessionId = projectSessionFor(
        state.sessions,
        architectKey,
        state.projectSessions[architectKey],
      );
      return {
        selectedArchitectKey: architectKey,
        openArchitects: state.openArchitects.includes(architectKey)
          ? state.openArchitects
          : [...state.openArchitects, architectKey],
        selectionEpoch: state.selectionEpoch + 1,
        ...selectionFor(state, sessionId),
      };
    });
  },

  setActiveSession(sessionId) {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) throw new Error(`Cannot switch to missing session ${sessionId}`);
      const key = session.architectKey;
      return {
        selectedArchitectKey: key,
        openArchitects: state.openArchitects.includes(key)
          ? state.openArchitects
          : [...state.openArchitects, key],
        projectSessions: { ...state.projectSessions, [key]: sessionId },
        selectionEpoch: state.selectionEpoch + 1,
        ...selectionFor(state, sessionId),
      };
    });
  },

  setActiveRightTab(tab) {
    set((state) => {
      if (!state.activeSessionId) return { activeRightTab: tab };
      return {
        activeRightTab: tab,
        sessionRightTabs: { ...state.sessionRightTabs, [state.activeSessionId]: tab },
      };
    });
  },

  setFocusedPane(pane) {
    set((state) => {
      if (!state.activeSessionId) return { focusedPane: pane };
      return {
        focusedPane: pane,
        sessionFocusedPanes: { ...state.sessionFocusedPanes, [state.activeSessionId]: pane },
      };
    });
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
      return { sessions, ...normalizeSelection({ ...state, sessions }) };
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

  markIntentResolving(intentId) {
    set((state) => {
      const intent = state.pendingIntents[intentId];
      if (!intent || intent.resolving) return state;
      return {
        pendingIntents: { ...state.pendingIntents, [intentId]: { ...intent, resolving: true } },
      };
    });
  },

  failPendingIntent(intentId, reason) {
    set((state) => {
      const intent = state.pendingIntents[intentId];
      if (!intent) return state;
      return {
        pendingIntents: {
          ...state.pendingIntents,
          [intentId]: { ...intent, resolving: false, failure: reason },
        },
      };
    });
  },

  clearPendingIntent(intentId) {
    set((state) => {
      if (!state.pendingIntents[intentId]) return state;
      const { [intentId]: _removed, ...pendingIntents } = state.pendingIntents;
      return { pendingIntents };
    });
  },

  setQuestion(question) {
    set((state) => ({ questions: { ...state.questions, [question.question_id]: question } }));
  },

  resolveQuestion(resolution, keepNotice) {
    set((state) => {
      const current = state.questions[resolution.question_id];
      if (!current || current.status !== 'pending') return state;
      if (!keepNotice) {
        const { [resolution.question_id]: _removed, ...questions } = state.questions;
        return { questions };
      }
      return {
        questions: {
          ...state.questions,
          [resolution.question_id]: {
            ...current,
            status: resolution.status,
            answer: resolution.answer,
            answered_by: resolution.answered_by,
            reason: resolution.reason,
            minimized: false,
          },
        },
      };
    });
  },

  dismissQuestion(questionId) {
    set((state) => {
      const current = state.questions[questionId];
      // A pending question can only be minimized, never dismissed: closing
      // the UI must not look like an answer.
      if (!current || current.status === 'pending') return state;
      const { [questionId]: _removed, ...questions } = state.questions;
      return { questions };
    });
  },

  setQuestionMinimized(questionId, minimized) {
    set((state) => {
      const current = state.questions[questionId];
      if (!current) return state;
      return { questions: { ...state.questions, [questionId]: { ...current, minimized } } };
    });
  },

  reset() {
    set(initialState);
  },
}));
