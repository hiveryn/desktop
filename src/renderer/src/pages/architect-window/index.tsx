import {
  ApiEnvelopeError,
  BottomBar,
  Caption,
  Close,
  CommandPalette,
  DevBadge,
  Glyph,
  IconButton,
  Navigation,
  Plus,
  Text,
} from '@components';
import type { Ticket, TicketSummary } from '@hiveryn/shared/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShortcutConfig } from '../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../keys/dispatcher';
import { matchesShortcut } from '../../keys/matchers';
import { useKeyDispatcher } from '../../keys/useKeyDispatcher';
import { useSessionStore } from '../../state/sessionStore';
import ApprovalDialog from './components/ApprovalDialog';
import BottomTabs from './components/BottomTabs';
import ConcludeSessionDialog from './components/ConcludeSessionDialog';
import FreeformSessionDialog from './components/FreeformSessionDialog';
import MainTerminalStack from './components/MainTerminalStack';
import RightPane from './components/RightPane';
import TicketWorkflow from './components/TicketWorkflow';
import { useArchitectData } from './hooks/useArchitectData';
import { useDaemonRecovery } from './hooks/useDaemonRecovery';
import { usePaletteSessionSwitch } from './hooks/usePaletteSessionSwitch';
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
  const { architect, userHome, board, boardLoading, boardError, loadError, refreshBoard } =
    useArchitectData(architectKey);
  useSessionEvents();
  useDaemonRecovery(architectKey);
  useSessionRestore(architectKey);
  usePaletteSessionSwitch();

  const { config: shortcutConfig, error: shortcutError } = useShortcutConfig();
  useKeyDispatcher(shortcutConfig);

  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const binding = shortcutConfig?.global?.['command-palette'];
    if (!binding) return;
    return registerDynamicHandler((e) => {
      if (paletteOpen) return 'passthrough';
      if (!matchesShortcut(e, binding)) return 'passthrough';
      setPaletteOpen(true);
      return 'consumed';
    });
  }, [shortcutConfig, paletteOpen]);

  const focusedPane = useSessionStore((s) => s.focusedPane);
  const setFocusedPane = useSessionStore((s) => s.setFocusedPane);
  const maximizedPane = useSessionStore((s) => s.maximizedPane);
  const setMaximizedPane = useSessionStore((s) => s.setMaximizedPane);
  const architectSessionId = useSessionStore((s) => {
    const found = Object.values(s.sessions).find((r) => r.type === 'architect');
    return found?.id ?? null;
  });

  // Only the active session's approval is shown, scoped to its pane — a pending
  // approval from a background session surfaces as a tab badge, not a modal.
  const activeApproval = useSessionStore((s) =>
    s.activeSessionId ? (s.pendingApprovals[s.activeSessionId] ?? null) : null,
  );

  const [concludeDialogOpen, setConcludeDialogOpen] = useState(false);
  const [freeformOpen, setFreeformOpen] = useState(false);
  // Tracked in state (not a ref) so the scoped dialog re-renders once the
  // split-pane element mounts and can portal into it. Scoping to the split
  // pane centers the dialog across both panes without covering nav/bottom bar.
  const [splitPaneEl, setSplitPaneEl] = useState<HTMLDivElement | null>(null);

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
  const isLeftMaximized = maximizedPane === 'main-terminal';
  const isRightMaximized = maximizedPane?.startsWith('right-') ?? false;

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
          <Caption>{architect ? shortenPath(architect.path, userHome) : ''}</Caption>
          <DevBadge />
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
            <div ref={setSplitPaneEl} className={styles.splitPane}>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: click tracks keyboard focus state; global keydown handles actual keyboard nav */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
              <div
                className={styles.leftPane}
                data-focused={isLeftFocused || undefined}
                data-maximized={isLeftMaximized || undefined}
                onClick={() => setFocusedPane('main-terminal')}
              >
                <MainTerminalStack className={styles.terminal} />
              </div>
              <div
                className={styles.rightPane}
                data-focused={isRightFocused || undefined}
                data-maximized={isRightMaximized || undefined}
              >
                <RightPane
                  architectKey={architectKey}
                  architect={architect}
                  board={board}
                  boardLoading={boardLoading}
                  boardError={boardError}
                  ticketError={ticketError}
                  isMaximized={isRightMaximized}
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

      <BottomBar
        className={styles.bottomBar}
        left={<BottomTabs />}
        right={
          <IconButton onClick={() => setFreeformOpen(true)} aria-label="New freeform session">
            <Glyph>
              <Plus />
            </Glyph>
          </IconButton>
        }
      />

      <TicketWorkflow
        architectKey={architectKey}
        selectedTicket={selectedTicket}
        spawnRequest={spawnRequest}
        shortcutConfig={shortcutConfig}
        onCloseTicket={handleTicketClose}
        onSpawnRequestClear={handleSpawnRequestClear}
        onBoardChanged={() => void refreshBoard()}
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {concludeDialogOpen && architectSessionId && (
        <ConcludeSessionDialog
          sessionId={architectSessionId}
          onClose={() => setConcludeDialogOpen(false)}
        />
      )}

      {freeformOpen && (
        <FreeformSessionDialog
          architectKey={architectKey}
          open={freeformOpen}
          onClose={() => setFreeformOpen(false)}
        />
      )}

      {activeApproval && splitPaneEl && (
        <ApprovalDialog
          approval={activeApproval}
          container={splitPaneEl}
          onClose={() => useSessionStore.getState().clearPendingApproval(activeApproval.sessionId)}
        />
      )}

      {maximizedPane !== null && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses maximize
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard dismiss handled by dispatcher Escape
        <div className={styles.backdrop} onClick={() => setMaximizedPane(null)} />
      )}
    </div>
  );
}
