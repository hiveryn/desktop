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
import type {
  SessionEvent,
  SessionTab,
  TicketBoard,
  TicketSummary,
} from '../../../../../shared/types';
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
    if (activeSession) {
      for (const tab of activeSession.tabs) {
        const mapped = mapTabToBarTab(tab);
        if (mapped) result.push(mapped);
      }
    }
    return result;
  }, [activeSession, isCompact]);

  // If the current right tab is no longer valid (e.g., switched session and the
  // extra terminal vanished), fall back gracefully.
  const tabIsValid = tabs.some((t) => t.id === activeRightTab);
  const effectiveTab = tabIsValid ? activeRightTab : (tabs[0]?.id ?? 'event-log');

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
        onTabClose={(id) => void handleTabClose(id)}
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
    const created = await window.hiveryn.terminals.create(sessionId, {
      command: 'bash',
    });
    const tabs = await window.hiveryn.tabs.list(sessionId);
    useSessionStore.getState().setSessionTabs(sessionId, tabs);
    useSessionStore.getState().setActiveRightTab(created.terminal_id);
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
