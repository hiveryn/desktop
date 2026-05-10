import {
  BottomBar,
  Caption,
  EventLog,
  type SessionEvent as EventLogSessionEvent,
  type EventStatus,
  Glyph,
  IconButton,
  Navigation,
  Plus,
  Text,
  ThemeSwitcher,
} from '@hiveryn/components';
import { useEffect, useMemo, useState } from 'react';
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
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [eventStream, setEventStream] = useState<{ sessionId: string } | null>(null);

  const eventLogEvents = useMemo(
    () =>
      events.map(toEventLogEvent).filter((event): event is EventLogSessionEvent => event !== null),
    [events],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!architectKey) {
        setLoadError('Missing architect key');
        return;
      }

      const [architectResult, homeResult] = await Promise.allSettled([
        window.hiveryn.architects.get(architectKey),
        window.hiveryn.system.getHome(),
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
            <div className={styles.leftPane}>
              <ArchitectTerminal
                architectKey={architectKey}
                onSessionConnected={handleSessionConnected}
                onSessionDisconnected={handleSessionDisconnected}
              />
            </div>
            <div className={styles.rightPane}>
              <EventLog className={styles.eventLog} events={eventLogEvents} />
            </div>
          </div>
        )}
      </main>

      <BottomBar left={<Caption>● daemon connected</Caption>} right={<ThemeSwitcher />} />
    </div>
  );
}
