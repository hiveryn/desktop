import type { AgentProfile } from '@hiveryn/components';
import {
  Activity,
  BottomBar,
  Caption,
  EventLog,
  type SessionEvent as EventLogSessionEvent,
  type EventStatus,
  Glyph,
  IconButton,
  Kanban,
  KanbanBoard,
  Navigation,
  Plus,
  ProfileSelector,
  SessionConcludedDialog,
  TabBar,
  type TabBarTab,
  Terminal,
  Text,
  ThemeSwitcher,
  TicketDetail,
} from '@hiveryn/components';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ArchitectTerminal from './ArchitectTerminal';
import styles from './index.module.css';
import SessionTerminal from './SessionTerminal';

const EVENT_STATUSES: EventStatus[] = [
  'starting',
  'working',
  'idle',
  'awaiting_input',
  'error',
  'ended',
];

const EMPTY_TICKET_BOARD: TicketBoard = { backlog: [], progress: [], done: [] };

const MOBILE_BREAKPOINT_PX = 960;

const KANBAN_ACTIVITY_TABS: TabBarTab[] = [
  { id: 'kanban', icon: Kanban },
  { id: 'event-log', icon: Activity },
];

const ACTIVITY_TAB: TabBarTab[] = [{ id: 'event-log', icon: Activity }];

const ARCHITECT_TAB_ID = '__architect__';

interface ActiveSessionTab {
  type: 'architect' | 'work';
  sessionId: string;
  label: string;
  wsUrl: string;
  ticketId?: string;
}

interface ConcludedSession {
  sessionId: string;
  sessionType: 'architect' | 'work';
  conclusionBody: string;
  commits?: string[];
  rejected?: boolean;
  rejectionReason?: string;
}

function isCompactViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
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

function readArchitectKey(): string {
  const prefix = '#/architect/';
  const hash = window.location.hash;
  if (!hash.startsWith(prefix)) return '';
  return decodeURIComponent(hash.slice(prefix.length));
}

function shortenPath(path: string, home: string | null): string {
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

export default function ArchitectWindow() {
  const architectKey = useMemo(readArchitectKey, []);
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('kanban');
  const [isCompact, setIsCompact] = useState<boolean>(() => isCompactViewport());
  const [board, setBoard] = useState<TicketBoard>(EMPTY_TICKET_BOARD);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const ticketRequestId = useRef(0);

  // ── Bottom bar session tabs ──────────────────────────────────────────────
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveSessionTab>>({});
  const [activeBottomTab, setActiveBottomTab] = useState<string>(ARCHITECT_TAB_ID);

  // ── Session concluded dialog ──────────────────────────────────────────────
  const [concludedSession, setConcludedSession] = useState<ConcludedSession | null>(null);

  // ── Refs for stable access from event listeners ───────────────────────────
  const activeSessionsRef = useRef(activeSessions);
  activeSessionsRef.current = activeSessions;
  const concludedSessionRef = useRef(concludedSession);
  concludedSessionRef.current = concludedSession;

  // ── Worker spawn ─────────────────────────────────────────────────────────
  const [showWorkerProfileSelector, setShowWorkerProfileSelector] = useState(false);
  const [workerSpawnTicket, setWorkerSpawnTicket] = useState<Ticket | null>(null);
  const [workerSpawnError, setWorkerSpawnError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);

  // ── Right-pane tabs (dynamic: worker sessions get only Activity) ─────────
  const rightPaneTabs = useMemo((): TabBarTab[] => {
    const sessionTab = activeBottomTab ? activeSessions[activeBottomTab] : null;
    if (sessionTab?.type === 'work') return ACTIVITY_TAB;
    return KANBAN_ACTIVITY_TABS;
  }, [activeBottomTab, activeSessions]);

  const availableTabs = useMemo((): TabBarTab[] => {
    if (isCompact) return [{ id: 'terminal', icon: Terminal }, ...rightPaneTabs];
    return rightPaneTabs;
  }, [isCompact, rightPaneTabs]);

  // ── Bottom bar tabs (Architect always present; worker tabs dynamic) ──────
  const bottomTabs = useMemo((): TabBarTab[] => {
    const tabs: TabBarTab[] = [{ id: ARCHITECT_TAB_ID, icon: Terminal, label: 'Architect' }];
    for (const s of Object.values(activeSessions)) {
      if (s.type === 'work') {
        tabs.push({ id: s.sessionId, icon: Terminal, label: s.label });
      }
    }
    return tabs;
  }, [activeSessions]);

  // ── Filtered events for the active session ───────────────────────────────
  const filteredEvents = useMemo(() => {
    const sessionTab = activeBottomTab ? activeSessions[activeBottomTab] : null;
    if (!sessionTab) return [];
    return events.filter((e) => e.session_id === sessionTab.sessionId);
  }, [events, activeBottomTab, activeSessions]);

  const eventLogEvents = useMemo(
    () =>
      filteredEvents
        .map(toEventLogEvent)
        .filter((event): event is EventLogSessionEvent => event !== null),
    [filteredEvents],
  );

  // ── Auto-switch right-pane tab when switching to a worker session ────────
  useEffect(() => {
    const sessionTab = activeBottomTab ? activeSessions[activeBottomTab] : null;
    if (sessionTab?.type === 'work') {
      setActiveTab('event-log');
    }
  }, [activeBottomTab, activeSessions]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);

    const syncViewport = (matches: boolean): void => {
      setIsCompact(matches);
      setActiveTab((current) => {
        if (matches) return 'terminal';
        if (current === 'terminal') return 'kanban';
        return current;
      });
    };

    syncViewport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent): void => {
      syncViewport(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!architectKey) {
        setLoadError('Missing architect key');
        setBoardLoading(false);
        return;
      }

      setLoadError(null);
      setBoardError(null);
      setBoardLoading(true);
      setSelectedTicket(null);
      setTicketError(null);

      const [architectResult, homeResult, boardResult] = await Promise.allSettled([
        window.hiveryn.architects.get(architectKey),
        window.hiveryn.system.getHome(),
        window.hiveryn.tickets.list(architectKey),
      ]);

      if (cancelled) return;

      if (architectResult.status === 'fulfilled') {
        setArchitect(architectResult.value);
      } else {
        setLoadError(
          architectResult.reason instanceof Error
            ? architectResult.reason.message
            : 'Failed to load architect',
        );
      }

      if (homeResult.status === 'fulfilled') {
        setHome(homeResult.value.home);
      }

      if (boardResult.status === 'fulfilled') {
        setBoard(boardResult.value);
      } else {
        setBoard(EMPTY_TICKET_BOARD);
        setBoardError(
          boardResult.reason instanceof Error
            ? boardResult.reason.message
            : 'Failed to load tickets',
        );
      }

      setBoardLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [architectKey]);

  useEffect(() => {
    if (!architectKey) return;

    const unsubscribe = window.hiveryn.architects.subscribeEvents(architectKey, (event) => {
      if (event.type !== 'workspace_changed') return;
      window.hiveryn.tickets
        .list(architectKey)
        .then((newBoard) => {
          setBoard(newBoard);
          setBoardError(null);
        })
        .catch((error: unknown) => {
          setBoardError(error instanceof Error ? error.message : 'Failed to refresh tickets');
        });
    });

    return unsubscribe;
  }, [architectKey]);

  // Always-on session event listener — accumulates events from all sessions
  // and detects session-ended events to show the conclusion dialog.
  useEffect(() => {
    return window.hiveryn.session.onEvent((event) => {
      setEvents((current) => [...current, event]);

      if (event.type === 'status' && event.status === 'ended') {
        const sessions = activeSessionsRef.current;

        // Don't show another dialog if one is already displayed.
        if (concludedSessionRef.current) return;

        const sessionTab = sessions[event.session_id];
        const archSession = sessions[ARCHITECT_TAB_ID];
        const isArchitect = archSession?.sessionId === event.session_id;

        if (!sessionTab && !isArchitect) return;

        const sessionType = isArchitect ? ('architect' as const) : ('work' as const);
        const raw = event.raw as
          | { body?: string; commits?: string[]; rejected?: boolean; rejection_reason?: string }
          | undefined;

        setConcludedSession({
          sessionId: event.session_id,
          sessionType,
          conclusionBody: raw?.body ?? 'Session concluded',
          commits: raw?.commits,
          rejected: raw?.rejected,
          rejectionReason: raw?.rejection_reason,
        });
      }
    });
  }, []);

  useEffect(() => {
    window.hiveryn.profiles
      .list()
      .then((list) => setProfiles(list ?? []))
      .catch(() => {});
  }, []);

  // Restore running sessions on mount — handles app relaunch / window refresh
  // while the daemon is still running.
  useEffect(() => {
    if (!architectKey) return;
    let cancelled = false;

    async function restore() {
      try {
        const sessions = await window.hiveryn.sessions.list();
        if (cancelled) return;

        const next: Record<string, ActiveSessionTab> = {};

        for (const s of sessions) {
          if (s.status !== 'running' || s.architect_key !== architectKey) continue;

          if (s.kind === 'architect') {
            next[ARCHITECT_TAB_ID] = {
              type: 'architect',
              sessionId: s.id,
              label: 'Architect',
              wsUrl: s.ws_url,
            };
          } else {
            next[s.id] = {
              type: 'work',
              sessionId: s.id,
              label: s.label,
              wsUrl: s.ws_url,
              ticketId: s.ticket_id,
            };
          }
        }

        if (!cancelled) setActiveSessions(next);
      } catch {
        // Non-fatal — user can start sessions manually.
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [architectKey]);

  // ── Bottom bar session management ────────────────────────────────────────

  function handleSessionConnected(sessionId: string, wsUrl: string): void {
    setActiveSessions((prev) => ({
      ...prev,
      [ARCHITECT_TAB_ID]: { type: 'architect', sessionId, label: 'Architect', wsUrl },
    }));
  }

  function handleSessionDisconnected(): void {
    setActiveSessions((prev) => {
      const next = { ...prev };
      delete next[ARCHITECT_TAB_ID];
      return next;
    });
  }

  function handleBottomTabChange(id: string): void {
    setActiveBottomTab(id);
    const sessionTab = activeSessions[id];
    if (sessionTab) {
      window.hiveryn.session.setActive(sessionTab.sessionId);
    }
    // Architect tab: when the session is connected, setActive so input routes there.
    if (id === ARCHITECT_TAB_ID) {
      const archSession = activeSessions[ARCHITECT_TAB_ID];
      if (archSession) {
        window.hiveryn.session.setActive(archSession.sessionId);
      }
    }
  }

  // ── Worker spawn ─────────────────────────────────────────────────────────

  function handleTicketSpawn(): void {
    setWorkerSpawnTicket(selectedTicket);
    setShowWorkerProfileSelector(true);
    setWorkerSpawnError(null);
  }

  async function handleWorkerProfileSelect(profileName: string): Promise<void> {
    if (!architectKey || !workerSpawnTicket) return;

    setShowWorkerProfileSelector(false);
    setWorkerSpawnError(null);

    try {
      const result = await window.hiveryn.architects.spawnWorker(
        architectKey,
        workerSpawnTicket.id,
        profileName,
        100,
        30,
      );

      const sessionId = result.session_id;
      setActiveSessions((prev) => ({
        ...prev,
        [sessionId]: {
          type: 'work',
          sessionId,
          label: truncate(workerSpawnTicket.title, 30),
          wsUrl: result.ws_url,
          ticketId: workerSpawnTicket.id,
        },
      }));
      setActiveBottomTab(sessionId);
      setWorkerSpawnTicket(null);
      handleTicketDetailClose();

      // Refresh board — ticket moved backlog → progress by the daemon.
      window.hiveryn.tickets
        .list(architectKey)
        .then((newBoard) => {
          setBoard(newBoard);
          setBoardError(null);
        })
        .catch((error: unknown) => {
          setBoardError(error instanceof Error ? error.message : 'Failed to refresh tickets');
        });
    } catch (err: unknown) {
      setWorkerSpawnError(err instanceof Error ? err.message : 'Worker spawn failed');
    }
  }

  // ── Ticket selection ─────────────────────────────────────────────────────

  async function handleTicketSelect(ticket: TicketSummary): Promise<void> {
    if (!architectKey) return;

    const requestId = ticketRequestId.current + 1;
    ticketRequestId.current = requestId;
    setTicketError(null);

    try {
      const nextTicket = await window.hiveryn.tickets.get(architectKey, ticket.id);
      if (ticketRequestId.current !== requestId) return;
      setSelectedTicket(nextTicket);
    } catch (error) {
      if (ticketRequestId.current !== requestId) return;
      setTicketError(error instanceof Error ? error.message : `Failed to load ticket ${ticket.id}`);
    }
  }

  function handleTicketDetailClose(): void {
    ticketRequestId.current += 1;
    setSelectedTicket(null);
  }

  // ── Terminal rendering ───────────────────────────────────────────────────

  function renderArchitectPane() {
    return (
      <ArchitectTerminal
        architectKey={architectKey}
        visible={activeBottomTab === ARCHITECT_TAB_ID}
        onSessionConnected={handleSessionConnected}
        onSessionDisconnected={handleSessionDisconnected}
      />
    );
  }

  function renderWorkerPane(session: ActiveSessionTab) {
    return (
      <SessionTerminal
        sessionId={session.sessionId}
        wsUrl={session.wsUrl}
        className={styles.terminal}
        visible={activeBottomTab === session.sessionId}
        onDisconnected={() => {
          setActiveSessions((prev) => {
            const next = { ...prev };
            delete next[session.sessionId];
            return next;
          });
          if (activeBottomTab === session.sessionId) {
            setActiveBottomTab(ARCHITECT_TAB_ID);
          }
        }}
      />
    );
  }

  // ── Right-pane content (desktop: Kanban/EventLog; compact: also Terminal) ─

  function renderTerminalPane() {
    return (
      <>
        {renderArchitectPane()}
        {Object.values(activeSessions)
          .filter((s) => s.type === 'work')
          .map((session) => (
            <React.Fragment key={session.sessionId}>{renderWorkerPane(session)}</React.Fragment>
          ))}
      </>
    );
  }

  function renderRightPaneContent() {
    if (activeTab === 'terminal') {
      return renderTerminalPane();
    }

    if (activeTab === 'kanban') {
      return (
        <div className={styles.kanbanPane}>
          {boardError ? <Text className={styles.error}>{boardError}</Text> : null}
          {ticketError ? <Text className={styles.error}>{ticketError}</Text> : null}
          {!boardError || boardLoading ? (
            <KanbanBoard
              className={styles.kanbanBoard}
              board={board}
              loading={boardLoading}
              emptyMessage="No tickets yet"
              onTicketSelect={handleTicketSelect}
            />
          ) : null}
        </div>
      );
    }

    return <EventLog className={styles.eventLog} events={eventLogEvents} />;
  }

  return (
    <div className={styles.window}>
      <Navigation
        right={
          <IconButton
            onClick={() => window.hiveryn.architect.openLauncher()}
            aria-label="Open launcher"
          >
            <Glyph>
              <Plus />
            </Glyph>
          </IconButton>
        }
      >
        <div className={styles.navTitle}>
          <Text as="span" className={styles.architectTitle}>
            {architect?.key.toUpperCase() ?? 'ARCHITECT'}
          </Text>
          <Caption>{architect ? shortenPath(architect.path, home) : ''}</Caption>
        </div>
      </Navigation>

      <main className={styles.content}>
        {loadError ? (
          <Text className={styles.error}>{loadError}</Text>
        ) : (
          <div className={styles.splitPane}>
            {!isCompact ? (
              <div className={styles.leftPane}>
                {renderArchitectPane()}
                {Object.values(activeSessions)
                  .filter((s) => s.type === 'work')
                  .map((session) => (
                    <React.Fragment key={session.sessionId}>
                      {renderWorkerPane(session)}
                    </React.Fragment>
                  ))}
              </div>
            ) : null}
            <div className={styles.rightPane}>
              <div className={styles.rightPaneContent}>{renderRightPaneContent()}</div>
              <TabBar
                className={styles.rightPaneTabs}
                tabs={availableTabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                side="right"
              />
            </div>
          </div>
        )}
      </main>

      <BottomBar
        className={styles.bottomBar}
        left={
          <TabBar
            tabs={bottomTabs}
            activeTab={activeBottomTab}
            onTabChange={handleBottomTabChange}
            side="bottom"
          />
        }
        right={<ThemeSwitcher />}
      />

      {selectedTicket ? (
        <TicketDetail
          ticket={selectedTicket}
          open
          onClose={handleTicketDetailClose}
          onSpawn={selectedTicket.status === 'backlog' ? handleTicketSpawn : undefined}
        />
      ) : null}

      <ProfileSelector
        profiles={profiles}
        open={showWorkerProfileSelector}
        onSelect={handleWorkerProfileSelect}
        onClose={() => {
          setShowWorkerProfileSelector(false);
          setWorkerSpawnError(null);
        }}
      />
      {workerSpawnError ? (
        <Text
          className={styles.error}
          style={{ position: 'fixed', bottom: 48, left: 16, zIndex: 100 }}
        >
          {workerSpawnError}
        </Text>
      ) : null}

      {concludedSession ? (
        <SessionConcludedDialog
          sessionType={concludedSession.sessionType}
          conclusionBody={concludedSession.conclusionBody}
          commits={concludedSession.commits}
          rejected={concludedSession.rejected}
          rejectionReason={concludedSession.rejectionReason}
          timerSeconds={5}
          onComplete={() => {
            const sessionId = concludedSession.sessionId;
            const isArchitect = concludedSession.sessionType === 'architect';

            // Delete session on the daemon — full cleanup (kill PTY, bridges, subscribers).
            window.hiveryn.sessions.delete(sessionId).catch(() => {});
            // Clean up client-side WebSocket/SSE subscription.
            window.hiveryn.session.disconnect(sessionId).catch(() => {});

            if (isArchitect) {
              // Close the entire architect window.
              window.hiveryn.architect.closeWindow().catch(() => {});
            } else {
              // Remove the worker tab and switch back to architect.
              setActiveSessions((prev) => {
                const next = { ...prev };
                delete next[sessionId];
                return next;
              });
              setActiveBottomTab(ARCHITECT_TAB_ID);
              const archSession = activeSessionsRef.current[ARCHITECT_TAB_ID];
              if (archSession) {
                window.hiveryn.session.setActive(archSession.sessionId);
              }
            }

            setConcludedSession(null);
          }}
        />
      ) : null}
    </div>
  );
}
