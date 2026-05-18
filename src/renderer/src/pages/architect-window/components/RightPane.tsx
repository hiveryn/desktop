import {
  Activity,
  EventLog,
  type SessionEvent as EventLogSessionEvent,
  type EventStatus,
  Kanban,
  KanbanBoard,
  TabBar,
  type TabBarTab,
  Terminal,
  Text,
} from '@components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  SessionEvent,
  SessionTab,
  TicketBoard,
  TicketSummary,
} from '../../../../../shared/types';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../keys/matchers';
import { useEventsForActiveSession } from '../../../state/selectors';
import { useSessionStore } from '../../../state/sessionStore';
import styles from '../index.module.css';
import ExtraTerminalStack from './ExtraTerminalStack';
import MainTerminalStack from './MainTerminalStack';

const EVENT_STATUSES: EventStatus[] = [
  'starting',
  'working',
  'idle',
  'awaiting_input',
  'error',
  'ended',
];

function isEventStatus(status: string): status is EventStatus {
  return EVENT_STATUSES.includes(status as EventStatus);
}

function toEventLogEvent(event: SessionEvent): EventLogSessionEvent | null {
  if (event.type !== 'status' || !event.status || !isEventStatus(event.status)) {
    return null;
  }
  return {
    id: event.id,
    session_id: event.session_id,
    seq: event.seq,
    type: 'status',
    status: event.status,
    tool: event.tool,
    message: event.message,
    metadata: event.metadata,
    raw: event.raw,
    at: event.at,
  };
}

// Maps a right-pane tab ID to a focusedPane value.
function tabIdToFocusId(tabId: string): string {
  if (tabId === 'kanban') return 'right-kanban';
  if (tabId === 'event-log') return 'right-event-log';
  if (tabId === 'terminal') return 'main-terminal';
  return `right-terminal:${tabId}`;
}

interface Props {
  isCompact: boolean;
  board: TicketBoard;
  boardLoading: boolean;
  boardError: string | null;
  ticketError: string | null;
  shortcutConfig: ShortcutConfig | null;
  onTicketSelect(ticket: TicketSummary): void;
  onSpawnTicket(ticket: TicketSummary): void;
  onRefreshBoard(): void;
}

export default function RightPane({
  isCompact,
  board,
  boardLoading,
  boardError,
  ticketError,
  shortcutConfig,
  onTicketSelect,
  onSpawnTicket,
  onRefreshBoard,
}: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);
  const focusedPane = useSessionStore((s) => s.focusedPane);
  const setActiveRightTab = useSessionStore((s) => s.setActiveRightTab);
  const setFocusedPane = useSessionStore((s) => s.setFocusedPane);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const events = useEventsForActiveSession();
  const eventLogEvents = useMemo(
    () =>
      events.map(toEventLogEvent).filter((event): event is EventLogSessionEvent => event !== null),
    [events],
  );

  const tabs = useMemo<TabBarTab[]>(() => {
    const result: TabBarTab[] = [];
    if (isCompact) {
      result.push({ id: 'terminal', icon: Terminal });
    }
    if (activeSession) {
      for (const tab of activeSession.tabs) {
        const mapped = mapTabToBarTab(tab);
        if (mapped) result.push(mapped);
      }
    }
    return result;
  }, [activeSession, isCompact]);

  const tabIsValid = tabs.some((t) => t.id === activeRightTab);
  const effectiveTab = tabIsValid ? activeRightTab : (tabs[0]?.id ?? 'event-log');

  // ── Kanban cursor ────────────────────────────────────────────────────────
  const cols = useMemo(() => [board.backlog, board.progress, board.done], [board]);
  const [kanbanCursor, setKanbanCursor] = useState({ col: 0, ticketIdx: 0 });

  // Reset cursor when board reloads
  // biome-ignore lint/correctness/useExhaustiveDependencies: board is a trigger dep, not read inside the effect
  useEffect(() => {
    setKanbanCursor({ col: 0, ticketIdx: 0 });
  }, [board]);

  const selectedTicketId = cols[kanbanCursor.col]?.[kanbanCursor.ticketIdx]?.id ?? null;

  // ── Event log cursor ─────────────────────────────────────────────────────
  // cursorDisplayIdx is a position in the reversed display list (0 = newest)
  const [cursorDisplayIdx, setCursorDisplayIdx] = useState(0);
  const [eventLogToggle, setEventLogToggle] = useState<{ id: string; seq: number } | null>(null);

  // Reset cursor on new events list
  // biome-ignore lint/correctness/useExhaustiveDependencies: length is a trigger dep, not read inside the effect
  useEffect(() => {
    setCursorDisplayIdx(0);
  }, [eventLogEvents.length]);

  // displayedEvents mirrors EventLog's internal reversed order
  const displayedEvents = useMemo(() => [...eventLogEvents].reverse(), [eventLogEvents]);
  const selectedEventId = displayedEvents[cursorDisplayIdx]?.id ?? null;

  // ── Pane-local keyboard shortcuts ────────────────────────────────────────
  const shortcutConfigRef = useRef(shortcutConfig);
  shortcutConfigRef.current = shortcutConfig;

  const kanbanCursorRef = useRef(kanbanCursor);
  kanbanCursorRef.current = kanbanCursor;

  const cursorDisplayIdxRef = useRef(cursorDisplayIdx);
  cursorDisplayIdxRef.current = cursorDisplayIdx;

  const colsRef = useRef(cols);
  colsRef.current = cols;

  const displayedEventsRef = useRef(displayedEvents);
  displayedEventsRef.current = displayedEvents;

  const onTicketSelectRef = useRef(onTicketSelect);
  onTicketSelectRef.current = onTicketSelect;

  const onSpawnTicketRef = useRef(onSpawnTicket);
  onSpawnTicketRef.current = onSpawnTicket;

  const onRefreshBoardRef = useRef(onRefreshBoard);
  onRefreshBoardRef.current = onRefreshBoard;

  const isKanbanFocused = focusedPane === 'right-kanban';
  const isEventLogFocused = focusedPane === 'right-event-log';

  useEffect(() => {
    if (!isKanbanFocused && !isEventLogFocused) return;
    return registerDynamicHandler((e) => {
      const cfg = shortcutConfigRef.current;
      if (!cfg) return 'passthrough';
      if (e.repeat) return 'passthrough';
      if (isTextInputFocused()) return 'passthrough';
      // Modifier-bearing combos belong to global shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return 'passthrough';

      if (isKanbanFocused) {
        const kanban = cfg.kanban ?? {};
        const cursor = kanbanCursorRef.current;
        const columns = colsRef.current;
        const colLen = columns[cursor.col]?.length ?? 0;

        if (matchesShortcut(e, kanban.left ?? '')) {
          setKanbanCursor({ col: (cursor.col - 1 + 3) % 3, ticketIdx: 0 });
          return 'consumed';
        }
        if (matchesShortcut(e, kanban.right ?? '')) {
          setKanbanCursor({ col: (cursor.col + 1) % 3, ticketIdx: 0 });
          return 'consumed';
        }
        if (matchesShortcut(e, kanban.down ?? '')) {
          if (colLen > 0)
            setKanbanCursor({ ...cursor, ticketIdx: (cursor.ticketIdx + 1) % colLen });
          return 'consumed';
        }
        if (matchesShortcut(e, kanban.up ?? '')) {
          if (colLen > 0)
            setKanbanCursor({ ...cursor, ticketIdx: (cursor.ticketIdx - 1 + colLen) % colLen });
          return 'consumed';
        }
        if (matchesShortcut(e, kanban.open ?? '')) {
          const ticket = columns[cursor.col]?.[cursor.ticketIdx];
          if (ticket) onTicketSelectRef.current(ticket);
          return 'consumed';
        }
        if (matchesShortcut(e, kanban.spawn ?? '')) {
          const ticket = columns[cursor.col]?.[cursor.ticketIdx];
          if (ticket) onSpawnTicketRef.current(ticket);
          return 'consumed';
        }
        if (matchesShortcut(e, kanban.refresh ?? '')) {
          onRefreshBoardRef.current();
          return 'consumed';
        }
      }

      if (isEventLogFocused) {
        const log = cfg['event-log'] ?? {};
        const idx = cursorDisplayIdxRef.current;
        const displayed = displayedEventsRef.current;

        if (matchesShortcut(e, log.down ?? '')) {
          setCursorDisplayIdx(Math.min(idx + 1, displayed.length - 1));
          return 'consumed';
        }
        if (matchesShortcut(e, log.up ?? '')) {
          setCursorDisplayIdx(Math.max(idx - 1, 0));
          return 'consumed';
        }
        if (matchesShortcut(e, log.open ?? '')) {
          const ev = displayed[idx];
          if (ev) {
            setEventLogToggle((prev) => ({ id: ev.id, seq: (prev?.seq ?? 0) + 1 }));
          }
          return 'consumed';
        }
        if (matchesShortcut(e, log.copy ?? '')) {
          const ev = displayed[idx];
          if (ev) {
            void navigator.clipboard.writeText(JSON.stringify(ev, null, 2));
          }
          return 'consumed';
        }
      }

      return 'passthrough';
    });
  }, [isKanbanFocused, isEventLogFocused]);

  // ── Tab close ────────────────────────────────────────────────────────────
  async function handleTabClose(id: string): Promise<void> {
    if (!activeSession) return;
    const terminalTab = activeSession.tabs.find((tab) => tab.type === 'terminal' && tab.id === id);
    if (!terminalTab?.id) return;
    try {
      await window.hiveryn.terminals.kill(activeSession.id, terminalTab.id);
    } catch {
      return;
    }
    await window.hiveryn.session.disconnect(activeSession.id, terminalTab.id).catch(() => {});
    const nextTabs = await window.hiveryn.tabs.list(activeSession.id).catch(() => null);
    if (nextTabs) {
      useSessionStore.getState().setSessionTabs(activeSession.id, nextTabs);
    }
  }

  // Click anywhere in the right pane sets focus to the current effective tab
  const handlePaneClick = useCallback(() => {
    setFocusedPane(tabIdToFocusId(effectiveTab));
  }, [effectiveTab, setFocusedPane]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: click tracks keyboard focus state; global keydown handles actual keyboard nav
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above
    <div className={styles.rightPaneInner} onClick={handlePaneClick}>
      <div className={styles.rightPaneContent}>
        {isCompact && (
          <div
            style={{
              display: effectiveTab === 'terminal' ? 'flex' : 'none',
              flex: 1,
              minHeight: 0,
              flexDirection: 'column',
            }}
          >
            <MainTerminalStack paneVisible={effectiveTab === 'terminal'} />
          </div>
        )}

        <div
          style={{
            display: effectiveTab === 'kanban' ? 'flex' : 'none',
            flex: 1,
            minHeight: 0,
            flexDirection: 'column',
          }}
        >
          <div className={styles.kanbanPane}>
            {boardError ? <Text className={styles.error}>{boardError}</Text> : null}
            {ticketError ? <Text className={styles.error}>{ticketError}</Text> : null}
            {!boardError || boardLoading ? (
              <KanbanBoard
                className={styles.kanbanBoard}
                board={board}
                loading={boardLoading}
                emptyMessage="No tickets yet"
                selectedTicketId={selectedTicketId}
                focusedColumn={isKanbanFocused ? kanbanCursor.col : null}
                onTicketSelect={onTicketSelect}
              />
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: effectiveTab === 'event-log' ? 'flex' : 'none',
            flex: 1,
            minHeight: 0,
            flexDirection: 'column',
          }}
        >
          <EventLog
            className={styles.eventLog}
            events={eventLogEvents}
            selectedEventId={selectedEventId}
            externalToggle={eventLogToggle}
          />
        </div>

        <ExtraTerminalStack />
      </div>

      <TabBar
        className={styles.rightPaneTabs}
        tabs={tabs}
        activeTab={effectiveTab}
        onTabChange={(id: string) => {
          setActiveRightTab(id);
          setFocusedPane(tabIdToFocusId(id));
        }}
        onTabClose={(id: string) => void handleTabClose(id)}
        onAdd={() => void handleOpenNewTerminal(activeSession?.id)}
        addLabel="New terminal"
        side="right"
      />
    </div>
  );
}

async function handleOpenNewTerminal(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;

  try {
    const created = await window.hiveryn.terminals.create(sessionId, {});
    const tabs = await window.hiveryn.tabs.list(sessionId);
    useSessionStore.getState().setSessionTabs(sessionId, tabs);
    useSessionStore.getState().setActiveRightTab(created.terminal_id);
    useSessionStore.getState().setFocusedPane(`right-terminal:${created.terminal_id}`);
  } catch {
    // Non-fatal — keep current layout.
  }
}

function mapTabToBarTab(tab: SessionTab): TabBarTab | null {
  switch (tab.type) {
    case 'kanban':
      return { id: 'kanban', icon: Kanban };
    case 'event-log':
      return { id: 'event-log', icon: Activity };
    case 'terminal':
      return tab.id ? { id: tab.id, icon: Terminal, closable: tab.status !== 'exited' } : null;
    default:
      return null;
  }
}
