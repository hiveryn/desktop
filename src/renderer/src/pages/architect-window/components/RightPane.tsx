import {
  Button,
  ErrorBoundary,
  EventLog,
  type SessionEvent as EventLogSessionEvent,
  type EventStatus,
  KanbanBoard,
  TabBar,
  type TabBarTab,
  Text,
} from '@components';
import type { SessionEvent, SessionTab, TicketBoard, TicketSummary } from '@hiveryn/shared/domain';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Architect } from '../../../../../shared/types';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../keys/matchers';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { useElapsedSeconds } from '../../../lib/useElapsedSeconds';
import { getTabPlugin } from '../../../plugins/registry';
import { useEventsForActiveSession } from '../../../state/selectors';
import { useSessionRepoScope } from '../../../state/sessionRepoScope';
import { useSessionStore } from '../../../state/sessionStore';
import { focusIdForTab, tabIdOf } from '../../../state/tabFocus';
import { boardView } from '../hooks/boardStatus';
import styles from '../index.module.css';
import {
  type PendingTerminal,
  requestTerminalCreation,
  usePendingTerminalStore,
} from '../terminalWorkdirPicker';
import ExtraTerminalStack from './ExtraTerminalStack';
import GitDiffPane from './GitDiffPane';
import TicketPane from './TicketPane';

const EVENT_STATUSES: EventStatus[] = [
  'starting',
  'working',
  'idle',
  'awaiting_input',
  'error',
  'ended',
];

// How long typing must pause before the board is searched. Short enough to
// feel live, long enough that a burst of keystrokes is one daemon listing.
const BOARD_SEARCH_DEBOUNCE_MS = 250;

// Whether a key event came from inside an open modal, whose keys must not
// reach the kanban search behind it.
function eventInsideDialog(e: KeyboardEvent): boolean {
  return e.target instanceof Element && e.target.closest('[role="dialog"]') !== null;
}

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

interface Props {
  architectKey: string;
  architect: Architect | null;
  board: TicketBoard;
  // The search `board` answers ('' for the whole board).
  boardQuery?: string;
  boardLoaded: boolean;
  boardLoading: boolean;
  boardError: unknown | null;
  shortcutConfig: ShortcutConfig | null;
  onTicketSelect(ticket: TicketSummary): void;
  onSpawnTicket(ticket: TicketSummary): void;
  onRefreshBoard(): void;
  /**
   * Lists the board matching a settled search query ('' restores the whole
   * board). Absent in windows without a kanban tab.
   */
  onSearchBoard?(query: string): void;
  /**
   * Context tabs owned by the embedding window, keyed by tab type (the Actions
   * window's `action` tab). Rendered like the built-in panels.
   */
  extraPanels?: Record<string, ReactNode>;
}

export default function RightPane({
  architectKey: _architectKey,
  architect,
  board,
  boardQuery = '',
  boardLoaded,
  boardLoading,
  boardError,
  shortcutConfig,
  onTicketSelect,
  onSpawnTicket,
  onRefreshBoard,
  onSearchBoard,
  extraPanels,
}: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);
  const focusedPane = useSessionStore((s) => s.focusedPane);
  const setActiveRightTab = useSessionStore((s) => s.setActiveRightTab);
  const setFocusedPane = useSessionStore((s) => s.setFocusedPane);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const pendingTerminal = usePendingTerminalStore((state) =>
    activeSessionId ? state.bySession[activeSessionId] : undefined,
  );
  const events = useEventsForActiveSession();
  const eventLogEvents = useMemo(
    () =>
      events.map(toEventLogEvent).filter((event): event is EventLogSessionEvent => event !== null),
    [events],
  );

  // Per-session repository scope (primary + additional repos), resolved once
  // from the ticket and the immutable session snapshot. Keyed by session id in
  // its own store, so switching sessions reads the right slice without
  // stale-data races.
  const repoScope = useSessionRepoScope(activeSession?.id);

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

  // ── Kanban search ────────────────────────────────────────────────────────
  // The field's text is local and immediate; the board is searched with the
  // settled (debounced) query, and clearing applies at once. Closing clears.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const typedQuery = searchText.trim();
  const settledQuery = useDebouncedValue(typedQuery, BOARD_SEARCH_DEBOUNCE_MS, '');

  const onSearchBoardRef = useRef(onSearchBoard);
  onSearchBoardRef.current = onSearchBoard;
  useEffect(() => {
    onSearchBoardRef.current?.(settledQuery);
  }, [settledQuery]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchText('');
  }, []);

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSearch();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      // Hand off to board navigation: once the input is blurred, j/k/o act
      // on the matches while the query stays applied.
      e.preventDefault();
      e.stopPropagation();
      searchInputRef.current?.blur();
    }
  };

  const matchCount = board.backlog.length + board.progress.length + board.done.length;
  let searchStatus = '';
  if (typedQuery !== boardQuery) {
    // The shown board answers another query; the error banner explains a
    // listing that failed, so nothing is claimed here then.
    if (boardLoading || settledQuery !== typedQuery) searchStatus = 'Searching…';
  } else if (boardQuery !== '') {
    searchStatus = `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`;
  }

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

  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;

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
        // A modal above the board keeps its own keys (the ticket detail's
        // Escape, typing in the launch dialog) — the search never opens or
        // closes behind it.
        if (!eventInsideDialog(e)) {
          if (matchesShortcut(e, kanban.search ?? '')) {
            // Already open: re-focus the input (e.g. after Enter handed the
            // keys to the board).
            setSearchOpen(true);
            searchInputRef.current?.focus();
            return 'consumed';
          }
          // Escape closes an open search even when focus has left the input
          // (its own onKeyDown covers the focused case via the text-input
          // guard above). Only consumed while the search is open.
          if (searchOpenRef.current && e.key === 'Escape') {
            closeSearch();
            return 'consumed';
          }
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
  }, [isKanbanFocused, isEventLogFocused, closeSearch]);

  // ── Terminal close (called from floating overlay on the pane) ────────────
  async function handleCloseTerminal(sessionId: string, terminalId: string): Promise<void> {
    await window.hiveryn.terminals.kill(sessionId, terminalId);
    await window.hiveryn.session.disconnect(sessionId, terminalId);
    const nextTabs = await window.hiveryn.tabs.list(sessionId);
    useSessionStore.getState().setSessionTabs(sessionId, nextTabs);
  }

  // Click anywhere in the right pane sets focus to the current effective tab
  const handlePaneClick = useCallback(() => {
    setFocusedPane(focusIdForTab(effectiveTab));
  }, [effectiveTab, setFocusedPane]);

  const view = boardView({ loaded: boardLoaded, loading: boardLoading, error: boardError });

  const primaryContent = (
    <>
      <div className={styles.tabPanel} data-active={effectiveTab === 'kanban'}>
        <div className={styles.kanbanPane}>
          {view.kind === 'board' && view.stale && (
            <div className={styles.boardStatus} role="alert">
              <Text as="span" className={styles.boardStatusText}>
                Could not refresh the board; showing the last loaded tickets. {view.error}
              </Text>
              <Button theme="SECONDARY" isDisabled={boardLoading} onClick={() => onRefreshBoard()}>
                {boardLoading ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          )}
          {view.kind === 'error' ? (
            <div className={styles.boardStatus} role="alert">
              <Text as="span" className={styles.boardStatusText}>
                Could not load the board. {view.error}
              </Text>
              <Button theme="SECONDARY" isDisabled={boardLoading} onClick={() => onRefreshBoard()}>
                {boardLoading ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          ) : (
            <ErrorBoundary paneLabel="Kanban">
              <KanbanBoard
                className={styles.kanbanBoard}
                board={board}
                loading={view.kind === 'loading'}
                emptyMessage={
                  boardQuery === '' ? 'No tickets yet' : `No tickets match “${boardQuery}”`
                }
                selectedTicketId={selectedTicketId}
                focusedColumn={isKanbanFocused ? kanbanCursor.col : null}
                onTicketSelect={onTicketSelect}
              />
            </ErrorBoundary>
          )}
          {searchOpen && (
            <div className={styles.kanbanSearch}>
              <input
                ref={searchInputRef}
                className={styles.kanbanSearchInput}
                type="text"
                aria-label="Search tickets"
                placeholder="Search titles, bodies and conclusions…"
                spellCheck={false}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onBlur={() => {
                  // Nothing typed: leaving the field is the same as closing it.
                  if (searchText.trim() === '') setSearchOpen(false);
                }}
              />
              {searchStatus !== '' && (
                <span className={styles.kanbanSearchStatus} role="status">
                  {searchStatus}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.tabPanel} data-active={effectiveTab === 'event-log'}>
        <ErrorBoundary paneLabel="Event Log">
          <EventLog
            className={styles.eventLog}
            events={eventLogEvents}
            selectedEventId={selectedEventId}
            externalToggle={eventLogToggle}
          />
        </ErrorBoundary>
      </div>

      <div className={styles.tabPanel} data-active={effectiveTab === 'ticket'}>
        {activeSession && (
          <ErrorBoundary paneLabel="Ticket" resetKeys={[activeSession.id]}>
            <TicketPane sessionId={activeSession.id} />
          </ErrorBoundary>
        )}
      </div>

      <div className={styles.tabPanel} data-active={effectiveTab === 'git-diff'}>
        {activeSession && (
          <ErrorBoundary paneLabel="Git Diff" resetKeys={[activeSession.id]}>
            <GitDiffPane
              sessionId={activeSession.id}
              architectKey={architect?.key}
              isActive={effectiveTab === 'git-diff'}
              repoScope={repoScope}
              shortcutConfig={shortcutConfig}
            />
          </ErrorBoundary>
        )}
      </div>

      {Object.entries(extraPanels ?? {}).map(([type, panel]) => (
        <div key={type} className={styles.tabPanel} data-active={effectiveTab === type}>
          <ErrorBoundary paneLabel={type} resetKeys={[activeSession?.id]}>
            {panel}
          </ErrorBoundary>
        </div>
      ))}

      <ExtraTerminalStack
        onCloseTerminal={(sessionId, terminalId) => void handleCloseTerminal(sessionId, terminalId)}
      />
    </>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: click tracks keyboard focus state; global keydown handles actual keyboard nav
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above
    <div className={styles.rightPaneInner} onClick={handlePaneClick}>
      <div className={styles.rightPaneContent}>
        {primaryContent}
        {pendingTerminal && <PendingTerminalStatus pending={pendingTerminal} />}
      </div>

      <div className={styles.tabColumn}>
        <TabBar
          tabs={tabs}
          activeTab={effectiveTab}
          onTabChange={(id: string) => {
            setActiveRightTab(id);
            setFocusedPane(focusIdForTab(id));
          }}
          onAdd={() => void handleOpenNewTerminal(activeSession?.id)}
          addLabel={pendingTerminal ? 'A terminal is being opened' : 'New terminal'}
          addDisabled={pendingTerminal !== undefined}
          side="right"
        />
      </div>
    </div>
  );
}

function PendingTerminalStatus({ pending }: { pending: PendingTerminal }) {
  const elapsed = useElapsedSeconds(pending.startedAt);
  const where = pending.machine ? ` on ${pending.machine} over SSH` : '';
  return (
    <div className={styles.pendingTerminal} role="status">
      Opening terminal in {pending.title}
      {where}… {elapsed !== null && elapsed > 0 ? `${elapsed}s` : ''}
    </div>
  );
}

async function handleOpenNewTerminal(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const state = useSessionStore.getState();
  requestTerminalCreation({
    sessionId,
    capturedActiveRightTab: state.activeRightTab,
    capturedFocusedPane: state.focusedPane,
  });
}

function mapTabToBarTab(tab: SessionTab): TabBarTab | null {
  const plugin = getTabPlugin(tab.type);
  if (!plugin) return null;
  return { id: tabIdOf(tab), icon: plugin.icon };
}
