import {
  BottomBar,
  Button,
  Caption,
  DevBadge,
  ErrorBoundary,
  ErrorCenterIndicator,
  ErrorCenterSheet,
  Glyph,
  IconButton,
  IntentCenter,
  Keyboard,
  Navigation,
  Plus,
  Text,
  WorkdirSelector,
} from '@components';
import type { TerminalWorkdir, Ticket, TicketSummary } from '@hiveryn/shared/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useErrorCenterCapture } from '../../hooks/useErrorCenterCapture';
import { useShortcutConfig } from '../../hooks/useShortcutConfig';
import { useKeyDispatcher } from '../../keys/useKeyDispatcher';
import { type SessionRecord, useSessionStore } from '../../state/sessionStore';
import BottomTabs from './components/BottomTabs';
import ConcludeSessionDialog from './components/ConcludeSessionDialog';
import FreeformSessionDialog from './components/FreeformSessionDialog';
import MainTerminalStack from './components/MainTerminalStack';
import RightPane from './components/RightPane';
import ShortcutsDialog from './components/ShortcutsDialog';
import TicketWorkflow from './components/TicketWorkflow';
import { useArchitectData } from './hooks/useArchitectData';
import { useArchitectSessionDiscovery } from './hooks/useArchitectSessionDiscovery';
import { useDaemonRecovery } from './hooks/useDaemonRecovery';
import { usePaletteSessionSwitch } from './hooks/usePaletteSessionSwitch';
import { useSessionEvents } from './hooks/useSessionEvents';
import styles from './index.module.css';
import {
  createSelectedTerminal,
  TERMINAL_WORKDIR_REQUEST,
  type TerminalCreationRequest,
} from './terminalWorkdirPicker';

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
  const {
    architect,
    userHome,
    board,
    boardLoading,
    boardError,
    loadError,
    refreshBoard,
    retryLoad,
  } = useArchitectData(architectKey);
  useSessionEvents();
  useDaemonRecovery(architectKey);
  useArchitectSessionDiscovery(architectKey);
  usePaletteSessionSwitch();
  useErrorCenterCapture();

  const { config: shortcutConfig } = useShortcutConfig();
  useKeyDispatcher(shortcutConfig);

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);
  const focusedPane = useSessionStore((s) => s.focusedPane);
  const setFocusedPane = useSessionStore((s) => s.setFocusedPane);
  const maximizedPane = useSessionStore((s) => s.maximizedPane);
  const setMaximizedPane = useSessionStore((s) => s.setMaximizedPane);

  const [concludeTarget, setConcludeTarget] = useState<SessionRecord | null>(null);
  const [freeformOpen, setFreeformOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [terminalRequest, setTerminalRequest] = useState<TerminalCreationRequest | null>(null);
  const [terminalWorkdirs, setTerminalWorkdirs] = useState<TerminalWorkdir[]>([]);

  useEffect(() => {
    const listener = (event: Event) => {
      const request = (event as CustomEvent<TerminalCreationRequest>).detail;
      setTerminalRequest(request);
      void window.hiveryn.terminals
        .listWorkdirs(request.sessionId)
        .then((choices) => {
          const state = useSessionStore.getState();
          if (
            state.activeSessionId !== request.sessionId ||
            state.activeRightTab !== request.capturedActiveRightTab ||
            state.focusedPane !== request.capturedFocusedPane
          ) {
            setTerminalRequest(null);
            return;
          }
          setTerminalWorkdirs(choices);
        })
        .catch(() => setTerminalRequest(null));
    };
    window.addEventListener(TERMINAL_WORKDIR_REQUEST, listener);
    return () => window.removeEventListener(TERMINAL_WORKDIR_REQUEST, listener);
  }, []);

  useEffect(() => {
    if (
      terminalRequest &&
      (activeSessionId !== terminalRequest.sessionId ||
        activeRightTab !== terminalRequest.capturedActiveRightTab ||
        focusedPane !== terminalRequest.capturedFocusedPane)
    )
      setTerminalRequest(null);
  }, [activeSessionId, activeRightTab, focusedPane, terminalRequest]);

  // Ticket selection state — kept local since only TicketWorkflow consumes it.
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [spawnRequest, setSpawnRequest] = useState<TicketSummary | null>(null);
  const ticketRequestId = useRef(0);

  async function handleTicketSelect(ticket: TicketSummary): Promise<void> {
    if (!architectKey) return;
    const requestId = ticketRequestId.current + 1;
    ticketRequestId.current = requestId;
    try {
      const next = await window.hiveryn.tickets.get(architectKey, ticket.id);
      if (ticketRequestId.current !== requestId) return;
      setSelectedTicket(next);
    } catch {
      // Already captured centrally via the onRequest capture bridge; the
      // detail view simply doesn't open.
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

  // Used by TicketWorkflow (in-body ticket references): "open this ticket id
  // in the existing Ticket Detail experience."
  function handleTicketReference(id: string): void {
    const target = [...board.backlog, ...board.progress, ...board.done].find(
      (ticket) => ticket.id === id,
    );
    if (target) void handleTicketSelect(target);
  }

  // Scope the ticket dialog to the session it was opened in — switching
  // sessions (Cmd+Shift+]) must dismiss it, not carry it into the next session.
  // Bump the request id so any in-flight tickets.get resolves as stale.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeSessionId is the trigger, not read inside — the effect must re-run on every session change.
  useEffect(() => {
    ticketRequestId.current += 1;
    setSelectedTicket(null);
    setSpawnRequest(null);
  }, [activeSessionId]);

  const isLeftFocused = focusedPane === 'main-terminal';
  const isRightFocused = focusedPane.startsWith('right-');
  const isLeftMaximized = maximizedPane === 'main-terminal';
  const isRightMaximized = maximizedPane?.startsWith('right-') ?? false;

  return (
    <div className={styles.window}>
      <Navigation
        className={styles.appbar}
        left={
          <div className={styles.navTitle}>
            <Text as="span" className={styles.architectTitle}>
              {architect?.name ?? architect?.key.toUpperCase() ?? 'ARCHITECT'}
            </Text>
            {architect ? (
              <>
                <span className={styles.navSep} aria-hidden="true">
                  ·
                </span>
                <Caption className={styles.navPath}>
                  {shortenPath(architect.path, userHome)}
                </Caption>
              </>
            ) : null}
            <DevBadge />
          </div>
        }
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
      />

      <main className={styles.content}>
        {loadError ? (
          <div className={styles.loadErrorStatus}>
            <Text as="span">Failed to load architect — see error center</Text>
            <Button theme="SECONDARY" onClick={() => void retryLoad()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className={styles.contentStack}>
            <div className={styles.splitPane}>
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
                <ErrorBoundary paneLabel="Right Pane" resetKeys={[activeSessionId]}>
                  <RightPane
                    architectKey={architectKey}
                    architect={architect}
                    board={board}
                    boardLoading={boardLoading}
                    boardError={boardError}
                    isMaximized={isRightMaximized}
                    shortcutConfig={shortcutConfig}
                    onTicketSelect={handleTicketSelect}
                    onSpawnTicket={handleSpawnTicket}
                    onRefreshBoard={() => void refreshBoard()}
                  />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomBar
        className={styles.bottomBar}
        left={<BottomTabs onConclude={setConcludeTarget} />}
        right={
          <>
            {shortcutConfig && (
              <IconButton
                onClick={() => setShortcutsOpen(true)}
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts"
              >
                <Glyph>
                  <Keyboard />
                </Glyph>
              </IconButton>
            )}
            <ErrorCenterIndicator />
            <IconButton onClick={() => setFreeformOpen(true)} aria-label="New freeform session">
              <Glyph>
                <Plus />
              </Glyph>
            </IconButton>
          </>
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
        onTicketReference={handleTicketReference}
      />

      {concludeTarget && (
        <ConcludeSessionDialog session={concludeTarget} onClose={() => setConcludeTarget(null)} />
      )}

      {shortcutsOpen && shortcutConfig && (
        <ShortcutsDialog config={shortcutConfig} onClose={() => setShortcutsOpen(false)} />
      )}

      {freeformOpen && (
        <FreeformSessionDialog
          architectKey={architectKey}
          open={freeformOpen}
          onClose={() => setFreeformOpen(false)}
        />
      )}

      {maximizedPane !== null && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses maximize
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard dismiss handled by dispatcher Escape
        <div className={styles.backdrop} onClick={() => setMaximizedPane(null)} />
      )}

      <IntentCenter />
      <WorkdirSelector
        choices={terminalWorkdirs}
        open={terminalRequest !== null && terminalWorkdirs.length > 0}
        onClose={() => setTerminalRequest(null)}
        onSelect={(choice) => {
          const request = terminalRequest;
          setTerminalRequest(null);
          if (request) void createSelectedTerminal(request, choice);
        }}
      />
      <ErrorCenterSheet />
    </div>
  );
}
