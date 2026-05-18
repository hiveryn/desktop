import { useEffect, useRef } from 'react';
import { useSessionStore } from '../state/sessionStore';
import { isInputFocused, matchesShortcut, type ShortcutConfig } from './useShortcutConfig';

// Maps a tab bar tab ID to a focusedPane value for the right pane.
function tabIdToFocusId(tabId: string): string {
  if (tabId === 'kanban') return 'right-kanban';
  if (tabId === 'event-log') return 'right-event-log';
  if (tabId === 'terminal') return 'main-terminal'; // compact mode: main terminal shown in right pane
  return `right-terminal:${tabId}`;
}

export function useNavigationShortcuts(config: ShortcutConfig | null): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (!config) return;

    // Helper: when a navigation shortcut matches, also stop propagation so that
    // xterm (which has its own keydown listener on the helper textarea) does not
    // process the same keystroke and emit it to the PTY.
    function consume(e: KeyboardEvent): void {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }

    function handler(e: KeyboardEvent): void {
      const cfg = configRef.current;
      if (!cfg?.global) return;

      if (isInputFocused()) return;

      const global = cfg.global;

      const state = useSessionStore.getState();
      const { focusedPane, activeSessionId, activeRightTab, sessions } = state;
      const { setFocusedPane, setActiveSession, setActiveRightTab } = state;

      // Build ordered session list: architect first, then workers
      const sessionArr = Object.values(sessions);
      const architect = sessionArr.find((s) => s.type === 'architect');
      const workers = sessionArr.filter((s) => s.type === 'work');
      const orderedSessions = [...(architect ? [architect] : []), ...workers];

      // Build the right tab ID list for the currently active session
      const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
      const rightTabIds: string[] = (activeSession?.tabs ?? []).flatMap((t) => {
        if (t.type === 'kanban') return ['kanban'];
        if (t.type === 'event-log') return ['event-log'];
        if (t.type === 'terminal' && t.id) return [t.id];
        return [];
      });
      const rightTabFocusIds = rightTabIds.map(tabIdToFocusId);

      // ── focus-left / focus-right ───────────────────────────────────────
      // Toggle between the left column (main-terminal) and the right pane.
      // Cycling within the right pane is handled by focus-down/up (j/k).
      if (matchesShortcut(e, global['focus-left'] ?? '')) {
        consume(e);
        if (focusedPane === 'main-terminal') {
          // Wrap to the currently active right tab (or first tab if invalid)
          if (activeRightTab && rightTabIds.includes(activeRightTab)) {
            setFocusedPane(tabIdToFocusId(activeRightTab));
          } else if (rightTabFocusIds[0]) {
            setActiveRightTab(rightTabIds[0]);
            setFocusedPane(rightTabFocusIds[0]);
          }
        } else {
          setFocusedPane('main-terminal');
        }
        return;
      }

      if (matchesShortcut(e, global['focus-right'] ?? '')) {
        consume(e);
        if (focusedPane === 'main-terminal') {
          if (activeRightTab && rightTabIds.includes(activeRightTab)) {
            setFocusedPane(tabIdToFocusId(activeRightTab));
          } else if (rightTabFocusIds[0]) {
            setActiveRightTab(rightTabIds[0]);
            setFocusedPane(rightTabFocusIds[0]);
          }
        } else if (focusedPane.startsWith('right-')) {
          setFocusedPane('main-terminal');
        }
        return;
      }

      // ── focus-down ──────────────────────────────────────────────────────
      // Cycles down through the vertically-stacked right pane tabs. Wraps
      // from the last tab back to the first.
      if (matchesShortcut(e, global['focus-down'] ?? '')) {
        consume(e);
        if (focusedPane.startsWith('right-') && rightTabFocusIds.length > 0) {
          const currentIdx = rightTabFocusIds.indexOf(focusedPane);
          const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % rightTabFocusIds.length;
          setActiveRightTab(rightTabIds[nextIdx]);
          setFocusedPane(rightTabFocusIds[nextIdx]);
        }
        return;
      }

      // ── focus-up ────────────────────────────────────────────────────────
      // Mirror of focus-down: cycles up through right pane tabs with wrap.
      if (matchesShortcut(e, global['focus-up'] ?? '')) {
        consume(e);
        if (focusedPane.startsWith('right-') && rightTabFocusIds.length > 0) {
          const currentIdx = rightTabFocusIds.indexOf(focusedPane);
          const n = rightTabFocusIds.length;
          const prevIdx = currentIdx === -1 ? n - 1 : (currentIdx - 1 + n) % n;
          setActiveRightTab(rightTabIds[prevIdx]);
          setFocusedPane(rightTabFocusIds[prevIdx]);
        }
        return;
      }

      // ── focus-main (Cmd+1) ──────────────────────────────────────────────
      if (matchesShortcut(e, global['focus-main'] ?? '')) {
        consume(e);
        setFocusedPane('main-terminal');
        return;
      }

      // ── Cmd+2..9: direct right-tab jump (position-based, not configurable) ──
      if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey) {
        const digit = parseInt(e.key, 10);
        if (!Number.isNaN(digit) && digit >= 2 && digit <= 9) {
          const tabIdx = digit - 2;
          if (tabIdx < rightTabIds.length) {
            consume(e);
            setActiveRightTab(rightTabIds[tabIdx]);
            setFocusedPane(rightTabFocusIds[tabIdx]);
          }
          return;
        }
      }

      // ── first-session ────────────────────────────────────────────────────
      // Jumps to the first session in the ordered list (the architect).
      if (matchesShortcut(e, global['first-session'] ?? '')) {
        consume(e);
        const first = orderedSessions[0];
        if (!first || first.id === activeSessionId) return;
        setActiveSession(first.id);
        if (first.type === 'work' && activeRightTab === 'kanban') setActiveRightTab('event-log');
        return;
      }

      // ── prev-session ─────────────────────────────────────────────────────
      if (matchesShortcut(e, global['prev-session'] ?? '')) {
        consume(e);
        if (orderedSessions.length < 2) return;
        const idx = orderedSessions.findIndex((s) => s.id === activeSessionId);
        const prev = orderedSessions[(idx - 1 + orderedSessions.length) % orderedSessions.length];
        if (!prev) return;
        setActiveSession(prev.id);
        if (prev.type === 'work' && activeRightTab === 'kanban') setActiveRightTab('event-log');
        return;
      }

      // ── next-session ─────────────────────────────────────────────────────
      if (matchesShortcut(e, global['next-session'] ?? '')) {
        consume(e);
        if (orderedSessions.length < 2) return;
        const idx = orderedSessions.findIndex((s) => s.id === activeSessionId);
        const next = orderedSessions[(idx + 1) % orderedSessions.length];
        if (!next) return;
        setActiveSession(next.id);
        if (next.type === 'work' && activeRightTab === 'kanban') setActiveRightTab('event-log');
        return;
      }

      // ── close-tab (Cmd+W) ────────────────────────────────────────────────
      if (matchesShortcut(e, global['close-tab'] ?? '')) {
        consume(e);
        void closeCurrentTab();
        return;
      }

      // ── new-terminal (Cmd+T) ─────────────────────────────────────────────
      if (matchesShortcut(e, global['new-terminal'] ?? '')) {
        consume(e);
        void openNewTerminal();
        return;
      }
    }

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [config]);
}

async function closeCurrentTab(): Promise<void> {
  const state = useSessionStore.getState();
  const { activeSessionId, activeRightTab, sessions } = state;

  const isExtraTerminalTab =
    activeRightTab !== 'kanban' && activeRightTab !== 'event-log' && activeRightTab !== 'terminal';

  if (isExtraTerminalTab && activeSessionId) {
    try {
      await window.hiveryn.terminals.kill(activeSessionId, activeRightTab);
    } catch {}
    await window.hiveryn.session.disconnect(activeSessionId, activeRightTab).catch(() => {});
    const nextTabs = await window.hiveryn.tabs.list(activeSessionId).catch(() => null);
    if (nextTabs) {
      const s = useSessionStore.getState();
      s.setSessionTabs(activeSessionId, nextTabs);
      const firstId =
        nextTabs[0]?.type === 'kanban'
          ? 'kanban'
          : nextTabs[0]?.type === 'event-log'
            ? 'event-log'
            : (nextTabs[0]?.id ?? 'event-log');
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
  } catch {}
}
