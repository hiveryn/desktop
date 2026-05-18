import {
  ApiEnvelopeError,
  BottomBar,
  Caption,
  Close,
  Glyph,
  IconButton,
  Navigation,
  Plus,
  Text,
  ThemeSwitcher,
} from '@components';
import { useMemo, useRef, useState } from 'react';
import type { Ticket, TicketSummary } from '../../../../shared/types';
import { useShortcutConfig } from '../../hooks/useShortcutConfig';
import { useKeyDispatcher } from '../../keys/useKeyDispatcher';
import { useSessionStore } from '../../state/sessionStore';
import BottomTabs from './components/BottomTabs';
import ConcludeSessionDialog from './components/ConcludeSessionDialog';
import MainTerminalStack from './components/MainTerminalStack';
import RightPane from './components/RightPane';
import TicketWorkflow from './components/TicketWorkflow';
import { useArchitectData } from './hooks/useArchitectData';
import { useDaemonRecovery } from './hooks/useDaemonRecovery';
import { useSessionEvents } from './hooks/useSessionEvents';
import { useSessionRestore } from './hooks/useSessionRestore';
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
  const { architect, home, board, boardLoading, boardError, loadError, refreshBoard } =
    useArchitectData(architectKey);
  useSessionEvents();
  useDaemonRecovery(architectKey);
  useSessionRestore(architectKey);

  const { config: shortcutConfig, error: shortcutError } = useShortcutConfig();
  useKeyDispatcher(shortcutConfig);

  const focusedPane = useSessionStore((s) => s.focusedPane);
  const setFocusedPane = useSessionStore((s) => s.setFocusedPane);
  const architectSessionId = useSessionStore((s) => {
    const found = Object.values(s.sessions).find((r) => r.type === 'architect');
    return found?.id ?? null;
  });

  const [concludeDialogOpen, setConcludeDialogOpen] = useState(false);

  // Ticket selection state — kept local since only TicketWorkflow consumes it.
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [spawnRequest, setSpawnRequest] = useState<TicketSummary | null>(null);
  const [ticketError, setTicketError] = useState<unknown | null>(null);
  const ticketRequestId = useRef(0);

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
      setTicketError(error);
    }
  }

  function handleTicketClose(): void {
    ticketRequestId.current += 1;
    setSelectedTicket(null);
  }

  function handleSpawnTicket(ticket: TicketSummary): void {
    // Spawning only makes sense for backlog tickets — `s` on others is a no-op.
    if (ticket.status !== 'backlog') return;
    setSpawnRequest(ticket);
  }

  function handleSpawnRequestClear(): void {
    setSpawnRequest(null);
  }

  const isLeftFocused = focusedPane === 'main-terminal';
  const isRightFocused = focusedPane.startsWith('right-');

  return (
    <div className={styles.window}>
      <Navigation
        right={
          <>
            <IconButton
              onClick={() => window.hiveryn.architect.openLauncher()}
              aria-label="Open launcher"
            >
              <Glyph>
                <Plus />
              </Glyph>
            </IconButton>
            {architectSessionId && (
              <IconButton
                className={styles.concludeBtn}
                onClick={() => setConcludeDialogOpen(true)}
                aria-label="Conclude session"
              >
                <Glyph>
                  <Close />
                </Glyph>
              </IconButton>
            )}
          </>
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
          <ApiEnvelopeError error={loadError} />
        ) : (
          <div className={styles.contentStack}>
            {shortcutError ? (
              <ApiEnvelopeError
                className={styles.shortcutError}
                error={shortcutError}
                title="Shortcut Config API Error"
              />
            ) : null}
            <div className={styles.splitPane}>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: click tracks keyboard focus state; global keydown handles actual keyboard nav */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
              <div
                className={styles.leftPane}
                data-focused={isLeftFocused || undefined}
                onClick={() => setFocusedPane('main-terminal')}
              >
                <MainTerminalStack className={styles.terminal} />
              </div>
              <div className={styles.rightPane} data-focused={isRightFocused || undefined}>
                <RightPane
                  board={board}
                  boardLoading={boardLoading}
                  boardError={boardError}
                  ticketError={ticketError}
                  shortcutConfig={shortcutConfig}
                  onTicketSelect={handleTicketSelect}
                  onSpawnTicket={handleSpawnTicket}
                  onRefreshBoard={() => void refreshBoard()}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomBar className={styles.bottomBar} left={<BottomTabs />} right={<ThemeSwitcher />} />

      <TicketWorkflow
        architectKey={architectKey}
        selectedTicket={selectedTicket}
        spawnRequest={spawnRequest}
        shortcutConfig={shortcutConfig}
        onCloseTicket={handleTicketClose}
        onSpawnRequestClear={handleSpawnRequestClear}
        onBoardChanged={() => void refreshBoard()}
      />

      {concludeDialogOpen && architectSessionId && (
        <ConcludeSessionDialog
          sessionId={architectSessionId}
          onClose={() => setConcludeDialogOpen(false)}
        />
      )}
    </div>
  );
}
