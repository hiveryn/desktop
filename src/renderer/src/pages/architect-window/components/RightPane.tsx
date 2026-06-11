import {
  ApiEnvelopeError,
  EventLog,
  type SessionEvent as EventLogSessionEvent,
  type EventStatus,
  KanbanBoard,
  TabBar,
  type TabBarTab,
} from '@components';
import type {
  SessionEvent,
  SessionTab,
  Ticket,
  TicketBoard,
  TicketSummary,
} from '@hiveryn/shared/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Architect } from '../../../../../shared/types';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../keys/matchers';
import { createPluginCall, getTabPlugin } from '../../../plugins/registry';
import { buildSessionContext } from '../../../plugins/sessionContext';
import { useEventsForActiveSession } from '../../../state/selectors';
import { useSessionStore } from '../../../state/sessionStore';
import styles from '../index.module.css';
import ExtraTerminalStack from './ExtraTerminalStack';
import TicketPane from './TicketPane';

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
    session_intent_id: event.session_intent_id,
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
  if (tabId === 'ticket') return 'right-ticket';
  return `right-terminal:${tabId}`;
}

interface Props {
  architectKey: string;
  architect: Architect | null;
  board: TicketBoard;
  boardLoading: boolean;
  boardError: unknown | null;
  ticketError: unknown | null;
  shortcutConfig: ShortcutConfig | null;
  onTicketSelect(ticket: TicketSummary): void;
  onSpawnTicket(ticket: TicketSummary): void;
  onRefreshBoard(): void;
}

export default function RightPane({
  architectKey: _architectKey,
  architect,
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

  // ── Plugin tab session context ──────────────────────────────────────────
  const [sessionTicket, setSessionTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (activeSession?.type !== 'ticket') {
      setSessionTicket(null);
      return;
    }
    let cancelled = false;
    setSessionTicket(null);
    window.hiveryn.sessions.getTicket(activeSession.id).then(
      (t) => {
        if (!cancelled) setSessionTicket(t);
      },
      () => {
        // Ticket fetch errors are surfaced by TicketPane; the plugin tab simply
        // renders without ticket context until it succeeds.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeSession?.id, activeSession?.type]);

  const sessionContext = useMemo(() => {
    if (!activeSession || !architect) return null;
    return buildSessionContext(activeSession, architect, sessionTicket);
  }, [activeSession, architect, sessionTicket]);

  const pluginTabs = useMemo(() => {
    if (!activeSession) return [];
    const reserved = new Set(['kanban', 'event-log', 'ticket', 'terminal']);
    return activeSession.tabs.filter((tab) => !reserved.has(tab.type) && getTabPlugin(tab.type));
  }, [activeSession]);

  const tabs = useMemo<TabBarTab[]>(() => {
    const result: TabBarTab[] = [];
    if (activeSession) {
      for (const tab of activeSession.tabs) {
        const mapped = mapTabToBarTab(tab);
        if (mapped) result.push(mapped);
      }
    }
    return result;
  }, [activeSession]);

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

  // ── Terminal close (called from floating overlay on the pane) ────────────
  async function handleCloseTerminal(sessionId: string, terminalId: string): Promise<void> {
    await window.hiveryn.terminals.kill(sessionId, terminalId);
    await window.hiveryn.session.disconnect(sessionId, terminalId);
    const nextTabs = await window.hiveryn.tabs.list(sessionId);
    useSessionStore.getState().setSessionTabs(sessionId, nextTabs);
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
        <div className={styles.tabPanel} data-active={effectiveTab === 'kanban'}>
          <div className={styles.kanbanPane}>
            {boardError ? <ApiEnvelopeError error={boardError} title="Tickets API Error" /> : null}
            {ticketError ? <ApiEnvelopeError error={ticketError} title="Ticket API Error" /> : null}
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

        <div className={styles.tabPanel} data-active={effectiveTab === 'event-log'}>
          <EventLog
            className={styles.eventLog}
            events={eventLogEvents}
            selectedEventId={selectedEventId}
            externalToggle={eventLogToggle}
          />
        </div>

        <div className={styles.tabPanel} data-active={effectiveTab === 'ticket'}>
          {activeSession && <TicketPane sessionId={activeSession.id} />}
        </div>

        {activeSession &&
          sessionContext &&
          pluginTabs.map((tab) => {
            const plugin = getTabPlugin(tab.type);
            if (!plugin) return null;
            const Content = plugin.content;
            return (
              <div
                key={tab.type}
                className={styles.tabPanel}
                data-active={effectiveTab === tab.type}
              >
                <Content
                  session={sessionContext}
                  call={createPluginCall(activeSession.id, tab.type)}
                />
              </div>
            );
          })}

        <ExtraTerminalStack
          onCloseTerminal={(sessionId, terminalId) =>
            void handleCloseTerminal(sessionId, terminalId)
          }
        />
      </div>

      <div className={styles.tabColumn}>
        <TabBar
          tabs={tabs}
          activeTab={effectiveTab}
          onTabChange={(id: string) => {
            setActiveRightTab(id);
            setFocusedPane(tabIdToFocusId(id));
          }}
          onAdd={() => void handleOpenNewTerminal(activeSession?.id)}
          addLabel="New terminal"
          side="right"
        />
      </div>
    </div>
  );
}

async function handleOpenNewTerminal(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;

  const created = await window.hiveryn.terminals.create(sessionId, {});
  const tabs = await window.hiveryn.tabs.list(sessionId);
  useSessionStore.getState().setSessionTabs(sessionId, tabs);
  useSessionStore.getState().setActiveRightTab(created.terminal_id);
  useSessionStore.getState().setFocusedPane(`right-terminal:${created.terminal_id}`);
}

function mapTabToBarTab(tab: SessionTab): TabBarTab | null {
  const plugin = getTabPlugin(tab.type);
  if (!plugin) return null;
  const tabId = tab.type === 'terminal' ? tab.id : tab.type;
  if (!tabId) return null;
  return { id: tabId, icon: plugin.icon };
}
