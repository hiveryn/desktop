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
import { getTabPlugin } from '../plugins/registry';
import { isSplitTerminalTab, type SessionRecord, useSessionStore } from '../state/sessionStore';
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
  const splitHorizontal =
    activeConfig?.['right-pane']?.['split-horizontal'] ?? global['split-horizontal'] ?? '';
  if (matchesShortcut(event, splitHorizontal)) {
    void openSplitTerminal();
    return 'consumed';
  }
  if (matchesShortcut(event, global['maximize-pane'] ?? '')) {
    const { focusedPane, maximizedPane, setMaximizedPane } = useSessionStore.getState();
    setMaximizedPane(maximizedPane !== null ? null : focusedPane);
    return 'consumed';
  }

  // NOTE: Escape is intentionally NOT used to dismiss maximize. A maximized
  // terminal must forward Escape to xterm (TUIs, vim, agent prompts rely on it).
  // Un-maximizing happens only via Cmd+M (above) or clicking the dimmed backdrop.

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

// Mirrors RightPane's mapTabToBarTab: every registered tab type (built-in OR
// plugin, e.g. git-diff) is cyclable; terminals are keyed by terminal id,
// everything else by type. Keep the two in sync or keyboard cycling will skip
// tabs that render fine with the mouse.
function getRightTabIds(): string[] {
  const { sessions, activeSessionId } = useSessionStore.getState();
  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  return (activeSession?.tabs ?? []).flatMap((t) => {
    if (isSplitTerminalTab(t)) return [];
    if (!getTabPlugin(t.type)) return [];
    if (t.type === 'terminal') return t.id ? [t.id] : [];
    return [t.type];
  });
}

function tabIdToFocusId(tabId: string): string {
  if (tabId === 'kanban') return 'right-kanban';
  if (tabId === 'event-log') return 'right-event-log';
  if (tabId === 'ticket') return 'right-ticket';
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
  const activeSession = state.activeSessionId ? state.sessions[state.activeSessionId] : undefined;
  const splitTabs = activeSession?.tabs.filter(isSplitTerminalTab) ?? [];
  const splitForFocusedBase = splitTabs.find(
    (tab) => tab.base_tab_id && tabIdToFocusId(tab.base_tab_id) === state.focusedPane,
  );
  const focusedSplit = splitTabs.find(
    (tab) => tab.id && `right-terminal:${tab.id}` === state.focusedPane,
  );
  const splitTab = splitForFocusedBase ?? focusedSplit;
  if (splitTab) {
    if (!splitTab.id)
      throw new Error(`Split terminal tab is missing id: ${JSON.stringify(splitTab)}`);
    if (!splitTab.base_tab_id) {
      throw new Error(`Split terminal ${splitTab.id} is missing base_tab_id`);
    }
    const splitFocusId = `right-terminal:${splitTab.id}`;
    const baseFocusId = tabIdToFocusId(splitTab.base_tab_id);
    if (delta > 0 && state.focusedPane === baseFocusId) {
      state.setFocusedPane(splitFocusId);
      return;
    }
    if (delta < 0 && state.focusedPane === splitFocusId) {
      state.setActiveRightTab(splitTab.base_tab_id);
      state.setFocusedPane(baseFocusId);
      return;
    }
  }
  const rightTabIds = getRightTabIds();
  if (rightTabIds.length === 0) return;
  const focusIds = rightTabIds.map(tabIdToFocusId);
  const idx =
    splitTab && state.focusedPane === `right-terminal:${splitTab.id}`
      ? rightTabIds.indexOf(splitTab.base_tab_id ?? '')
      : focusIds.indexOf(state.focusedPane);
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

function getOrderedSessions(): { id: string; type: SessionRecord['type'] }[] {
  const { sessions } = useSessionStore.getState();
  const arr = Object.values(sessions);
  const architect = arr.find((s) => s.type === 'architect');
  const workers = arr.filter((s) => s.type !== 'architect');
  return [...(architect ? [architect] : []), ...workers].map((s) => ({ id: s.id, type: s.type }));
}

function firstSession(): void {
  const state = useSessionStore.getState();
  const ordered = getOrderedSessions();
  const first = ordered[0];
  if (!first || first.id === state.activeSessionId) return;
  state.setActiveSession(first.id);
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
  state.setFocusedPane('main-terminal');
}

// ── Tab/terminal actions ─────────────────────────────────────────────────────

async function closeCurrentTab(): Promise<void> {
  const state = useSessionStore.getState();
  const { activeSessionId, activeRightTab, sessions, focusedPane } = state;

  const focusedTerminalId = focusedPane.startsWith('right-terminal:')
    ? focusedPane.slice('right-terminal:'.length)
    : null;

  if (activeSessionId) {
    const session = sessions[activeSessionId];
    const terminalToClose = session?.tabs.find(
      (tab) => tab.type === 'terminal' && tab.id === focusedTerminalId,
    )?.id;
    const activeTerminalToClose = session?.tabs.find(
      (tab) =>
        tab.type === 'terminal' &&
        tab.id === activeRightTab &&
        !isSplitTerminalTab(tab) &&
        activeRightTab !== 'kanban' &&
        activeRightTab !== 'event-log' &&
        activeRightTab !== 'ticket',
    )?.id;
    const targetTerminalId = terminalToClose ?? activeTerminalToClose;

    if (targetTerminalId) {
      await window.hiveryn.terminals.kill(activeSessionId, targetTerminalId);
      await window.hiveryn.session.disconnect(activeSessionId, targetTerminalId);
      const nextTabs = await window.hiveryn.tabs.list(activeSessionId);
      useSessionStore.getState().setSessionTabs(activeSessionId, nextTabs);
      return;
    }
  }

  if (!activeSessionId) return;
  const session = sessions[activeSessionId];
  if (session?.type !== 'architect') {
    await window.hiveryn.session.disconnect(activeSessionId);
    const s = useSessionStore.getState();
    s.unregisterSession(activeSessionId);
    s.setFocusedPane('main-terminal');
  }
}

async function openNewTerminal(): Promise<void> {
  const { activeSessionId } = useSessionStore.getState();
  if (!activeSessionId) return;
  const created = await window.hiveryn.terminals.create(activeSessionId, { placement: 'tab' });
  const tabs = await window.hiveryn.tabs.list(activeSessionId);
  const s = useSessionStore.getState();
  s.setSessionTabs(activeSessionId, tabs);
  s.setActiveRightTab(created.terminal_id);
  s.setFocusedPane(`right-terminal:${created.terminal_id}`);
}

async function openSplitTerminal(): Promise<void> {
  const { activeSessionId, activeRightTab, sessions, focusedPane } = useSessionStore.getState();
  if (!activeSessionId || !focusedPane.startsWith('right-')) return;
  const session = sessions[activeSessionId];
  if (!session) {
    throw new Error(`Cannot split right pane for missing session ${activeSessionId}`);
  }
  if (session.tabs.some((tab) => isSplitTerminalTab(tab) && tab.base_tab_id === activeRightTab)) {
    return;
  }
  const created = await window.hiveryn.terminals.create(activeSessionId, {
    placement: 'split',
    base_tab_id: activeRightTab,
  });
  const tabs = await window.hiveryn.tabs.list(activeSessionId);
  const s = useSessionStore.getState();
  s.setSessionTabs(activeSessionId, tabs);
  s.setFocusedPane(`right-terminal:${created.terminal_id}`);
}
