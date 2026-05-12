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
  TabBar,
  type TabBarTab,
  Terminal,
  Text,
  ThemeSwitcher,
  TicketDetail,
} from '@hiveryn/components';
import { useEffect, useMemo, useRef, useState } from 'react';
import ArchitectTerminal from './ArchitectTerminal';
import styles from './index.module.css';

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

const DESKTOP_TABS: TabBarTab[] = [
  { id: 'kanban', icon: Kanban },
  { id: 'event-log', icon: Activity },
];

const MOBILE_TABS: TabBarTab[] = [{ id: 'terminal', icon: Terminal }, ...DESKTOP_TABS];

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
  const [eventStream, setEventStream] = useState<{ sessionId: string } | null>(null);
  const ticketRequestId = useRef(0);

  const eventLogEvents = useMemo(
    () =>
      events.map(toEventLogEvent).filter((event): event is EventLogSessionEvent => event !== null),
    [events],
  );

  const availableTabs = isCompact ? MOBILE_TABS : DESKTOP_TABS;

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
    if (!eventStream) return;

    return window.hiveryn.session.onEvent((event) => {
      if (event.session_id !== eventStream.sessionId) return;
      setEvents((current) => [...current, event]);
    });
  }, [eventStream]);

  function handleSessionConnected(sessionId: string): void {
    setEvents([]);
    setEventStream({ sessionId });
  }

  function handleSessionDisconnected(): void {
    setEvents([]);
    setEventStream(null);
  }

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

  function renderRightPaneContent() {
    if (activeTab === 'terminal') {
      return (
        <ArchitectTerminal
          architectKey={architectKey}
          onSessionConnected={handleSessionConnected}
          onSessionDisconnected={handleSessionDisconnected}
        />
      );
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
                <ArchitectTerminal
                  architectKey={architectKey}
                  onSessionConnected={handleSessionConnected}
                  onSessionDisconnected={handleSessionDisconnected}
                />
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
        left={<Caption>● daemon connected</Caption>}
        right={<ThemeSwitcher />}
      />
      {selectedTicket ? (
        <TicketDetail ticket={selectedTicket} open onClose={handleTicketDetailClose} />
      ) : null}
    </div>
  );
}
