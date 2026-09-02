import {
  ErrorBoundary,
  EventLog,
  type SessionEvent as EventLogSessionEvent,
  type EventStatus,
  KanbanBoard,
  TabBar,
  type TabBarTab,
  type TabTypeChoice,
  TabTypePicker,
} from '@components';
import type { SessionEvent, SessionTab, TicketBoard, TicketSummary } from '@hiveryn/shared/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Architect } from '../../../../../shared/types';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../keys/matchers';
import { getTabPlugin } from '../../../plugins/registry';
import { useFilesStore } from '../../../state/filesStore';
import { useEventsForActiveSession } from '../../../state/selectors';
import { useSessionRepoScope } from '../../../state/sessionRepoScope';
import { isSplitTerminalTab, useSessionStore } from '../../../state/sessionStore';
import { focusIdForTab, tabIdOf } from '../../../state/tabFocus';
import styles from '../index.module.css';
import { requestTerminalCreation } from '../terminalWorkdirPicker';
import BrowserPane from './BrowserPane';
import ExtraTerminalStack from './ExtraTerminalStack';
import FilesPane from './files/FilesPane';
import GitDiffPane from './GitDiffPane';
import RoadmapPane from './Roadmap/RoadmapPane';
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
  boardLoading: boolean;
  boardError: unknown | null;
  isMaximized: boolean;
  shortcutConfig: ShortcutConfig | null;
  onTicketSelect(ticket: TicketSummary): void;
  onSpawnTicket(ticket: TicketSummary): void;
  onRefreshBoard(): void;
  onTicketReference(ticketId: string): void;
}

export default function RightPane({
  architectKey: _architectKey,
  architect,
  board,
  boardLoading,
  boardError,
  isMaximized,
  shortcutConfig,
  onTicketSelect,
  onSpawnTicket,
  onRefreshBoard,
  onTicketReference,
}: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);
  const focusedPane = useSessionStore((s) => s.focusedPane);
  const setActiveRightTab = useSessionStore((s) => s.setActiveRightTab);
  const setFocusedPane = useSessionStore((s) => s.setFocusedPane);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  // Sourced only to give the Files pane's ErrorBoundary resetKeys that match
  // the exact values (currentDir walking outside rootPath) that can crash it.
  const filesSlice = useFilesStore((s) =>
    activeSession ? s.bySession[activeSession.id] : undefined,
  );
  const filesRootPath = filesSlice?.rootPath;
  const filesCurrentDir = filesSlice?.currentDir;
  const events = useEventsForActiveSession();
  const eventLogEvents = useMemo(
    () =>
      events.map(toEventLogEvent).filter((event): event is EventLogSessionEvent => event !== null),
    [events],
  );

  // Per-session repository scope (primary + additional repos), resolved once
  // from the ticket and the immutable session snapshot. Keyed by session id in
  // its own store, so the Files and Git review panes share one source and
  // switching sessions reads the right slice without stale-data races.
  const repoScope = useSessionRepoScope(activeSession?.id);

  const hasAnySplit = useMemo(
    () => activeSession?.tabs.some((tab) => isSplitTerminalTab(tab)) ?? false,
    [activeSession],
  );

  const tabs = useMemo<TabBarTab[]>(() => {
    const result: TabBarTab[] = [];
    if (activeSession) {
      for (const tab of activeSession.tabs.filter((candidate) => !isSplitTerminalTab(candidate))) {
        const mapped = mapTabToBarTab(tab);
        if (mapped) result.push(mapped);
      }
    }
    return result;
  }, [activeSession]);

  const tabIsValid = tabs.some((t) => t.id === activeRightTab);
  const effectiveTab = tabIsValid ? activeRightTab : (tabs[0]?.id ?? 'event-log');
  const splitTab = useMemo(
    () =>
      activeSession?.tabs.find(
        (tab) => isSplitTerminalTab(tab) && tab.base_tab_id === effectiveTab,
      ) ?? null,
    [activeSession, effectiveTab],
  );
  const splitAppliesToEffectiveTab = splitTab !== null;

  // The active tab is a browser tab when its uuid matches a browser SessionTab.
  const activeBrowserTab = useMemo(
    () =>
      activeSession?.tabs.find((tab) => tab.type === 'browser' && tab.id === effectiveTab) ?? null,
    [activeSession, effectiveTab],
  );

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

  // ── New-tab type picker (Terminal | Browser) anchored on the "+" button ──────
  const [tabPickerAnchor, setTabPickerAnchor] = useState<DOMRect | null>(null);

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
    setFocusedPane(focusIdForTab(effectiveTab, activeSession?.tabs ?? []));
  }, [effectiveTab, setFocusedPane, activeSession]);

  const primaryContent = (
    <>
      <div className={styles.tabPanel} data-active={effectiveTab === 'kanban'}>
        <div className={styles.kanbanPane}>
          {!boardError || boardLoading ? (
            <ErrorBoundary paneLabel="Kanban">
              <KanbanBoard
                className={styles.kanbanBoard}
                board={board}
                loading={boardLoading}
                emptyMessage="No tickets yet"
                selectedTicketId={selectedTicketId}
                focusedColumn={isKanbanFocused ? kanbanCursor.col : null}
                onTicketSelect={onTicketSelect}
              />
            </ErrorBoundary>
          ) : null}
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

      <div className={styles.tabPanel} data-active={effectiveTab === 'files'}>
        {activeSession && architect && (
          <ErrorBoundary
            paneLabel="Files"
            resetKeys={[activeSession.id, filesRootPath, filesCurrentDir]}
          >
            <FilesPane
              sessionId={activeSession.id}
              architect={architect}
              isActive={effectiveTab === 'files'}
              repoScope={repoScope}
              shortcutConfig={shortcutConfig}
            />
          </ErrorBoundary>
        )}
      </div>

      <div className={styles.tabPanel} data-active={effectiveTab === 'roadmap'}>
        <ErrorBoundary paneLabel="Roadmap">
          <RoadmapPane
            architectKey={architect?.key}
            isActive={effectiveTab === 'roadmap'}
            shortcutConfig={shortcutConfig}
            onTicketReference={onTicketReference}
          />
        </ErrorBoundary>
      </div>

      <div className={styles.tabPanel} data-active={!!activeBrowserTab}>
        {activeSession && activeBrowserTab && (
          <ErrorBoundary paneLabel="Browser" resetKeys={[effectiveTab]}>
            <BrowserPane
              key={effectiveTab}
              sessionId={activeSession.id}
              tabId={effectiveTab}
              target={activeBrowserTab.target ?? ''}
              isMaximized={isMaximized}
            />
          </ErrorBoundary>
        )}
      </div>

      <ExtraTerminalStack
        mode="primary"
        onCloseTerminal={(sessionId, terminalId) => void handleCloseTerminal(sessionId, terminalId)}
      />
    </>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: click tracks keyboard focus state; global keydown handles actual keyboard nav
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above
    <div className={styles.rightPaneInner} onClick={handlePaneClick}>
      <div className={styles.rightPaneContent}>
        {hasAnySplit ? (
          <div
            className={styles.rightPaneSplit}
            data-maximized={isMaximized || undefined}
            data-split-active={splitAppliesToEffectiveTab || undefined}
          >
            <div className={styles.rightPaneSplitPrimary}>{primaryContent}</div>
            <div className={styles.rightPaneSplitSecondary}>
              <ExtraTerminalStack
                mode="split"
                enabled={splitAppliesToEffectiveTab}
                baseTabId={effectiveTab}
                onCloseTerminal={(sessionId, terminalId) =>
                  void handleCloseTerminal(sessionId, terminalId)
                }
              />
            </div>
          </div>
        ) : (
          primaryContent
        )}
      </div>

      <div className={styles.tabColumn}>
        <TabBar
          tabs={tabs}
          activeTab={effectiveTab}
          onTabChange={(id: string) => {
            setActiveRightTab(id);
            setFocusedPane(focusIdForTab(id, activeSession?.tabs ?? []));
          }}
          onAdd={(e) => setTabPickerAnchor(e.currentTarget.getBoundingClientRect())}
          addLabel="New tab"
          side="right"
        />
      </div>

      <TabTypePicker
        open={tabPickerAnchor !== null}
        anchor={tabPickerAnchor}
        onClose={() => setTabPickerAnchor(null)}
        onSelect={(choice: TabTypeChoice) => {
          if (choice === 'terminal') void handleOpenNewTerminal(activeSession?.id);
          else void handleOpenNewBrowser(activeSession?.id);
        }}
      />
    </div>
  );
}

async function handleOpenNewTerminal(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const state = useSessionStore.getState();
  requestTerminalCreation({
    sessionId,
    placement: 'tab',
    capturedActiveRightTab: state.activeRightTab,
    capturedFocusedPane: state.focusedPane,
  });
}

// New browser tabs open at a default homepage (the daemon requires a valid,
// non-empty target); the URL bar auto-focuses so the user can type an address.
const BROWSER_HOMEPAGE = 'https://www.google.com';

async function handleOpenNewBrowser(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;

  const created = await window.hiveryn.tabs.createBrowserTab(sessionId, {
    target: BROWSER_HOMEPAGE,
  });
  const tabs = await window.hiveryn.tabs.list(sessionId);
  useSessionStore.getState().setSessionTabs(sessionId, tabs);
  useSessionStore.getState().setActiveRightTab(created.tab_id);
  useSessionStore.getState().setFocusedPane(`right-browser:${created.tab_id}`);
}

function mapTabToBarTab(tab: SessionTab): TabBarTab | null {
  if (isSplitTerminalTab(tab)) return null;
  const plugin = getTabPlugin(tab.type);
  if (!plugin) return null;
  return { id: tabIdOf(tab), icon: plugin.icon };
}
