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
} from '@hiveryn/components';
import { useMemo } from 'react';
import type { SessionEvent, TicketBoard, TicketSummary } from '../../../../../shared/types';
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

interface Props {
  isCompact: boolean;
  board: TicketBoard;
  boardLoading: boolean;
  boardError: string | null;
  ticketError: string | null;
  onTicketSelect(ticket: TicketSummary): void;
}

export default function RightPane({
  isCompact,
  board,
  boardLoading,
  boardError,
  ticketError,
  onTicketSelect,
}: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);
  const setActiveRightTab = useSessionStore((s) => s.setActiveRightTab);

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
    if (activeSession?.type === 'architect') {
      result.push({ id: 'kanban', icon: Kanban });
    }
    result.push({ id: 'event-log', icon: Activity });
    if (activeSession) {
      for (const t of Object.values(activeSession.terminals)) {
        if (t.name === 'main') continue;
        result.push({ id: t.name, icon: Terminal, closable: true });
      }
    }
    return result;
  }, [activeSession, isCompact]);

  // If the current right tab is no longer valid (e.g., switched session and the
  // extra terminal vanished), fall back gracefully.
  const tabIsValid = tabs.some((t) => t.id === activeRightTab);
  const effectiveTab = tabIsValid ? activeRightTab : (tabs[0]?.id ?? 'event-log');

  function handleTabClose(id: string): void {
    if (!activeSession) return;
    const terminal = activeSession.terminals[id];
    if (!terminal) return;
    void window.hiveryn.terminals.kill(activeSession.id, terminal.name).catch(() => {});
    window.hiveryn.session.disconnect(activeSession.id, terminal.name);
    useSessionStore.getState().removeTerminal(activeSession.id, terminal.name);
    if (activeRightTab === id) {
      setActiveRightTab(activeSession.type === 'architect' ? 'kanban' : 'event-log');
    }
  }

  return (
    <div className={styles.rightPane}>
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
          <EventLog className={styles.eventLog} events={eventLogEvents} />
        </div>

        <ExtraTerminalStack />
      </div>

      <TabBar
        className={styles.rightPaneTabs}
        tabs={tabs}
        activeTab={effectiveTab}
        onTabChange={setActiveRightTab}
        onTabClose={handleTabClose}
        onAdd={() => void handleOpenNewTerminal(activeSession?.id)}
        addLabel="New terminal"
        side="right"
      />
    </div>
  );
}

async function handleOpenNewTerminal(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const session = useSessionStore.getState().sessions[sessionId];
  if (!session) return;

  // Find a fresh name like 'bash', 'bash-2', etc.
  const existingNames = new Set(Object.keys(session.terminals));
  let candidate = 'bash';
  let i = 2;
  while (existingNames.has(candidate)) {
    candidate = `bash-${i++}`;
  }

  try {
    const created = await window.hiveryn.terminals.create(sessionId, {
      name: candidate,
      command: 'bash',
    });
    useSessionStore.getState().addTerminal(sessionId, {
      sessionId,
      name: created.name,
      wsUrl: created.ws_url,
      status: 'connecting',
    });
    useSessionStore.getState().setActiveRightTab(created.name);
  } catch {
    // daemon may reject duplicate names; ignore
  }
}
