import {
  BottomBar,
  Caption,
  Glyph,
  IconButton,
  Navigation,
  Plus,
  Text,
  ThemeSwitcher,
} from '@hiveryn/components';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ticket, TicketSummary } from '../../../../shared/types';
import { useSessionStore } from '../../state/sessionStore';
import BottomTabs from './components/BottomTabs';
import ConcludedSessionFlow from './components/ConcludedSessionFlow';
import LeftPane from './components/LeftPane';
import RightPane from './components/RightPane';
import TicketWorkflow from './components/TicketWorkflow';
import { useArchitectData } from './hooks/useArchitectData';
import { useSessionEvents } from './hooks/useSessionEvents';
import { useSessionRestore } from './hooks/useSessionRestore';
import { useViewportMode } from './hooks/useViewportMode';
import styles from './index.module.css';

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
  const isCompact = useViewportMode();
  const { architect, home, board, boardLoading, boardError, loadError, refreshBoard } =
    useArchitectData(architectKey);
  const { concludedSession, dismissConcludedSession } = useSessionEvents();
  useSessionRestore(architectKey);

  // Ticket selection state — kept local since only TicketWorkflow consumes it.
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const ticketRequestId = useRef(0);

  // On viewport mode change, snap activeRightTab to a tab that exists in that mode.
  useEffect(() => {
    const { activeRightTab, setActiveRightTab } = useSessionStore.getState();
    if (isCompact && activeRightTab === 'kanban') {
      // Compact mode adds 'terminal' tab; default to it.
      setActiveRightTab('terminal');
    } else if (!isCompact && activeRightTab === 'terminal') {
      setActiveRightTab('kanban');
    }
  }, [isCompact]);

  async function handleTicketSelect(ticket: TicketSummary): Promise<void> {
    if (!architectKey) return;
    const requestId = ticketRequestId.current + 1;
    ticketRequestId.current = requestId;
    setTicketError(null);
    try {
      const next = await window.hiveryn.tickets.get(architectKey, ticket.id);
      if (ticketRequestId.current !== requestId) return;
      setSelectedTicket(next);
    } catch (error) {
      if (ticketRequestId.current !== requestId) return;
      setTicketError(error instanceof Error ? error.message : `Failed to load ticket ${ticket.id}`);
    }
  }

  function handleTicketClose(): void {
    ticketRequestId.current += 1;
    setSelectedTicket(null);
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
            {!isCompact ? <LeftPane /> : null}
            <RightPane
              isCompact={isCompact}
              board={board}
              boardLoading={boardLoading}
              boardError={boardError}
              ticketError={ticketError}
              onTicketSelect={handleTicketSelect}
            />
          </div>
        )}
      </main>

      <BottomBar className={styles.bottomBar} left={<BottomTabs />} right={<ThemeSwitcher />} />

      <TicketWorkflow
        architectKey={architectKey}
        selectedTicket={selectedTicket}
        onCloseTicket={handleTicketClose}
        onBoardChanged={() => void refreshBoard()}
      />

      <ConcludedSessionFlow
        concludedSession={concludedSession}
        onDismiss={dismissConcludedSession}
      />
    </div>
  );
}
