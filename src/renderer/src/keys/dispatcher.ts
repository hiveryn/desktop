// Central keyboard-event router for the architect window.
//
// Two callers:
//   1. useKeyDispatcher (document bubble-phase) — for events when xterm does
//      NOT have focus (kanban, event-log, modals, chrome).
//   2. TerminalPane's attachCustomKeyEventHandler — for events when xterm
//      DOES have focus, before xterm processes them.
//
// Both routes call `dispatch()` with the same KeyboardEvent. The dispatcher
// decides 'consumed' (caller should preventDefault/stopPropagation, or in
// xterm's case skip its own processing) or 'passthrough' (let the natural
// path continue: type into input / send to PTY).

import type { ShortcutConfig } from '../hooks/useShortcutConfig';
import { useSessionStore } from '../state/sessionStore';
import { matchesShortcut } from './matchers';

export type DispatchResult = 'consumed' | 'passthrough';
export type DispatchHandler = (event: KeyboardEvent) => DispatchResult;

// Dynamic handlers cover modal/pane-local shortcuts that need access to
// component-local state (e.g., kanban cursor, dialog-open state). Registered
// in LIFO order; the most recently registered handler runs first, mirroring
// modal stacking semantics.
const dynamicHandlers: DispatchHandler[] = [];

export function registerDynamicHandler(handler: DispatchHandler): () => void {
  dynamicHandlers.push(handler);
  return () => {
    const idx = dynamicHandlers.indexOf(handler);
    if (idx >= 0) dynamicHandlers.splice(idx, 1);
  };
}

// Active shortcut config — set by useKeyDispatcher when the daemon config loads.
let activeConfig: ShortcutConfig | null = null;
export function setActiveShortcutConfig(config: ShortcutConfig | null): void {
  activeConfig = config;
}

export function dispatch(event: KeyboardEvent): DispatchResult {
  // 1. Dynamic handlers first (modals, pane-local shortcuts) in LIFO order.
  for (let i = dynamicHandlers.length - 1; i >= 0; i--) {
    if (dynamicHandlers[i](event) === 'consumed') return 'consumed';
  }

  // 2. Global shortcuts (always available — they all use modifier combos).
  return dispatchGlobal(event);
}

function dispatchGlobal(event: KeyboardEvent): DispatchResult {
  const global = activeConfig?.global;
  if (!global) return 'passthrough';

  if (matchesShortcut(event, global['focus-left'] ?? '')) {
    focusLeft();
    return 'consumed';
  }
  if (matchesShortcut(event, global['focus-right'] ?? '')) {
    focusRight();
    return 'consumed';
  }
  if (matchesShortcut(event, global['focus-down'] ?? '')) {
    focusDown();
    return 'consumed';
  }
  if (matchesShortcut(event, global['focus-up'] ?? '')) {
    focusUp();
    return 'consumed';
  }
  if (matchesShortcut(event, global['focus-main'] ?? '')) {
    useSessionStore.getState().setFocusedPane('main-terminal');
    return 'consumed';
  }
  if (matchesShortcut(event, global['first-session'] ?? '')) {
    firstSession();
    return 'consumed';
  }
  if (matchesShortcut(event, global['prev-session'] ?? '')) {
    cycleSession(-1);
    return 'consumed';
  }
  if (matchesShortcut(event, global['next-session'] ?? '')) {
    cycleSession(1);
    return 'consumed';
  }
  if (matchesShortcut(event, global['close-tab'] ?? '')) {
    void closeCurrentTab();
    return 'consumed';
  }
  if (matchesShortcut(event, global['new-terminal'] ?? '')) {
    void openNewTerminal();
    return 'consumed';
  }

  // Cmd+2..9: direct right-tab jump (position-based, not configurable).
  if (event.metaKey && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.repeat) {
    const digit = parseInt(event.key, 10);
    if (!Number.isNaN(digit) && digit >= 2 && digit <= 9) {
      if (jumpRightTab(digit - 2)) return 'consumed';
    }
  }

  return 'passthrough';
}

// ── Right-pane tab inventory helpers ─────────────────────────────────────────

function getRightTabIds(): string[] {
  const { sessions, activeSessionId } = useSessionStore.getState();
  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  return (activeSession?.tabs ?? []).flatMap((t) => {
    if (t.type === 'kanban') return ['kanban'];
    if (t.type === 'event-log') return ['event-log'];
    if (t.type === 'terminal' && t.id) return [t.id];
    return [];
  });
}

function tabIdToFocusId(tabId: string): string {
  if (tabId === 'kanban') return 'right-kanban';
  if (tabId === 'event-log') return 'right-event-log';
  if (tabId === 'terminal') return 'main-terminal';
  return `right-terminal:${tabId}`;
}

// ── Focus actions ────────────────────────────────────────────────────────────

function focusLeft(): void {
  const state = useSessionStore.getState();
  if (state.focusedPane === 'main-terminal') {
    moveFocusToActiveRightTab();
  } else {
    state.setFocusedPane('main-terminal');
  }
}

function focusRight(): void {
  const state = useSessionStore.getState();
  if (state.focusedPane === 'main-terminal') {
    moveFocusToActiveRightTab();
  } else if (state.focusedPane.startsWith('right-')) {
    state.setFocusedPane('main-terminal');
  }
}

function moveFocusToActiveRightTab(): void {
  const state = useSessionStore.getState();
  const rightTabIds = getRightTabIds();
  if (state.activeRightTab && rightTabIds.includes(state.activeRightTab)) {
    state.setFocusedPane(tabIdToFocusId(state.activeRightTab));
    return;
  }
  const first = rightTabIds[0];
  if (first) {
    state.setActiveRightTab(first);
    state.setFocusedPane(tabIdToFocusId(first));
  }
}

function focusDown(): void {
  cycleRightTabFocus(1);
}

function focusUp(): void {
  cycleRightTabFocus(-1);
}

function cycleRightTabFocus(delta: number): void {
  const state = useSessionStore.getState();
  if (!state.focusedPane.startsWith('right-')) return;
  const rightTabIds = getRightTabIds();
  if (rightTabIds.length === 0) return;
  const focusIds = rightTabIds.map(tabIdToFocusId);
  const idx = focusIds.indexOf(state.focusedPane);
  const n = focusIds.length;
  const nextIdx = idx === -1 ? (delta > 0 ? 0 : n - 1) : (idx + delta + n) % n;
  state.setActiveRightTab(rightTabIds[nextIdx]);
  state.setFocusedPane(focusIds[nextIdx]);
}

function jumpRightTab(idx: number): boolean {
  const state = useSessionStore.getState();
  const rightTabIds = getRightTabIds();
  if (idx >= rightTabIds.length) return false;
  state.setActiveRightTab(rightTabIds[idx]);
  state.setFocusedPane(tabIdToFocusId(rightTabIds[idx]));
  return true;
}

// ── Session actions ──────────────────────────────────────────────────────────

function getOrderedSessions(): { id: string; type: 'architect' | 'work' }[] {
  const { sessions } = useSessionStore.getState();
  const arr = Object.values(sessions);
  const architect = arr.find((s) => s.type === 'architect');
  const workers = arr.filter((s) => s.type === 'work');
  return [...(architect ? [architect] : []), ...workers].map((s) => ({ id: s.id, type: s.type }));
}

function firstSession(): void {
  const state = useSessionStore.getState();
  const ordered = getOrderedSessions();
  const first = ordered[0];
  if (!first || first.id === state.activeSessionId) return;
  state.setActiveSession(first.id);
  if (first.type === 'work' && state.activeRightTab === 'kanban') {
    state.setActiveRightTab('event-log');
  }
  state.setFocusedPane('main-terminal');
}

function cycleSession(delta: number): void {
  const state = useSessionStore.getState();
  const ordered = getOrderedSessions();
  if (ordered.length < 2) return;
  const idx = ordered.findIndex((s) => s.id === state.activeSessionId);
  const next = ordered[(idx + delta + ordered.length) % ordered.length];
  if (!next || next.id === state.activeSessionId) return;
  state.setActiveSession(next.id);
  if (next.type === 'work' && state.activeRightTab === 'kanban') {
    state.setActiveRightTab('event-log');
  }
  state.setFocusedPane('main-terminal');
}

// ── Tab/terminal actions ─────────────────────────────────────────────────────

async function closeCurrentTab(): Promise<void> {
  const state = useSessionStore.getState();
  const { activeSessionId, activeRightTab, sessions } = state;

  const isExtraTerminalTab =
    activeRightTab !== 'kanban' && activeRightTab !== 'event-log' && activeRightTab !== 'terminal';

  if (isExtraTerminalTab && activeSessionId) {
    try {
      await window.hiveryn.terminals.kill(activeSessionId, activeRightTab);
    } catch {
      // already killed
    }
    await window.hiveryn.session.disconnect(activeSessionId, activeRightTab).catch(() => {});
    const nextTabs = await window.hiveryn.tabs.list(activeSessionId).catch(() => null);
    if (nextTabs) {
      const s = useSessionStore.getState();
      s.setSessionTabs(activeSessionId, nextTabs);
      const firstTab = nextTabs[0];
      const firstId =
        firstTab?.type === 'kanban'
          ? 'kanban'
          : firstTab?.type === 'event-log'
            ? 'event-log'
            : (firstTab?.id ?? 'event-log');
      s.setActiveRightTab(firstId);
      s.setFocusedPane(
        `right-${firstId === 'kanban' || firstId === 'event-log' ? firstId : `terminal:${firstId}`}`,
      );
    }
    return;
  }

  if (!activeSessionId) return;
  const session = sessions[activeSessionId];
  if (session?.type === 'work') {
    void window.hiveryn.session.disconnect(activeSessionId).catch(() => {});
    const s = useSessionStore.getState();
    s.unregisterSession(activeSessionId);
    s.setFocusedPane('main-terminal');
  }
}

async function openNewTerminal(): Promise<void> {
  const { activeSessionId } = useSessionStore.getState();
  if (!activeSessionId) return;
  try {
    const created = await window.hiveryn.terminals.create(activeSessionId, {});
    const tabs = await window.hiveryn.tabs.list(activeSessionId);
    const s = useSessionStore.getState();
    s.setSessionTabs(activeSessionId, tabs);
    s.setActiveRightTab(created.terminal_id);
    s.setFocusedPane(`right-terminal:${created.terminal_id}`);
  } catch {
    // non-fatal
  }
}
