import type { AgentProfile } from '@components';
import {
  ActionCenter,
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
  ProfileSelector,
  QuestionPanel,
  Text,
  WorkdirSelector,
} from '@components';
import type { TerminalWorkdir, Ticket, TicketSummary } from '@hiveryn/shared/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useErrorCenterCapture } from '../../hooks/useErrorCenterCapture';
import { useShortcutConfig } from '../../hooks/useShortcutConfig';
import { useKeyDispatcher } from '../../keys/useKeyDispatcher';
import { noVariantMessage, profilesForMachine } from '../../lib/variantMachines';
import { useArchitectStatusStore } from '../../state/architectStatusStore';
import { useSessionStore } from '../../state/sessionStore';
import AgentMessagesStrip from './components/AgentMessages/AgentMessagesStrip';
import CompanionRecoveryDialog from './components/CompanionRecoveryDialog';
import ConcludeSessionDialog from './components/ConcludeSessionDialog';
import MainTerminalStack from './components/MainTerminalStack';
import RightPane from './components/RightPane';
import ShortcutsDialog from './components/ShortcutsDialog';
import TicketWorkflow from './components/TicketWorkflow';
import { useArchitectData } from './hooks/useArchitectData';
import { useArchitectSessionDiscovery } from './hooks/useArchitectSessionDiscovery';
import { useArchitectStatusPolling } from './hooks/useArchitectStatusPolling';
import { useDaemonRecovery } from './hooks/useDaemonRecovery';
import { useSessionEvents } from './hooks/useSessionEvents';
import { useWorkbenchRequests } from './hooks/useWorkbenchRequests';
import styles from './index.module.css';
import { ArchitectLauncherDialog, ArchitectLauncherView } from './launcher/ArchitectLauncher';
import { useArchitectLaunch } from './sidebar/launchArchitect';
import SessionSidebar, {
  type CompanionRecoveryTarget,
  type ConcludeTarget,
} from './sidebar/SessionSidebar';
import {
  createSelectedTerminal,
  TERMINAL_WORKDIR_REQUEST,
  type TerminalCreationRequest,
} from './terminalWorkdirPicker';

function shortenPath(path: string, home: string | null): string {
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}

// Discovery for one open project: its session-lifecycle stream and resyncs.
// Mounted for every project opened in the window, selected or not, so a
// background project's sessions keep their state current.
function ProjectSessionSync({ architectKey }: { architectKey: string }) {
  useArchitectSessionDiscovery(architectKey);
  return null;
}

// The one Hiveryn window: the session sidebar beside the selected project's
// workspace (agent terminal + context pane). Window-level hooks — session
// events, error capture, key dispatch, daemon recovery — are mounted exactly
// once here, whatever the number of open projects.
export default function Workbench() {
  const architectKey = useSessionStore((s) => s.selectedArchitectKey) ?? '';
  const openArchitects = useSessionStore((s) => s.openArchitects);
  const {
    architect,
    userHome,
    board,
    boardQuery,
    boardLoading,
    boardLoaded,
    boardError,
    loadError,
    refreshBoard,
    retryLoad,
    searchBoard,
  } = useArchitectData(architectKey);
  useSessionEvents();
  useDaemonRecovery();
  useErrorCenterCapture();
  useArchitectStatusPolling();
  useWorkbenchRequests();

  const { config: shortcutConfig } = useShortcutConfig();
  useKeyDispatcher(shortcutConfig);

  // Tell the main process whose intent cards are on screen, so an OS
  // notification is suppressed only for those.
  useEffect(() => {
    window.hiveryn.workbench.setIntentScope(architectKey || null);
  }, [architectKey]);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);
  const focusedPane = useSessionStore((s) => s.focusedPane);
  const setFocusedPane = useSessionStore((s) => s.setFocusedPane);
  const maximizedPane = useSessionStore((s) => s.maximizedPane);
  const setMaximizedPane = useSessionStore((s) => s.setMaximizedPane);
  const statuses = useArchitectStatusStore((s) => s.statuses);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const architectStatus = statuses.find((status) => status.key === architectKey);
  const projectName = architect?.name || architectStatus?.name || architectKey;
  const sessionTitle = useMemo(() => {
    if (!activeSession) return null;
    if (activeSession.type === 'architect') return 'Architect';
    if (activeSession.type === 'companion') return `Companion ${activeSession.label}`;
    const listed = architectStatus?.sessions.find((session) => session.id === activeSession.id);
    return listed?.title ?? activeSession.label;
  }, [activeSession, architectStatus]);

  const [concludeTarget, setConcludeTarget] = useState<ConcludeTarget | null>(null);
  const [recoveryTarget, setRecoveryTarget] = useState<CompanionRecoveryTarget | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [terminalRequest, setTerminalRequest] = useState<TerminalCreationRequest | null>(null);
  const [terminalWorkdirs, setTerminalWorkdirs] = useState<TerminalWorkdir[]>([]);

  // Variant selection for launching an architect session (sidebar, launcher).
  const pickingKey = useArchitectLaunch((s) => s.pickingKey);
  const cancelPick = useArchitectLaunch((s) => s.cancelPick);
  const launchArchitect = useArchitectLaunch((s) => s.launch);
  const openArchitect = useArchitectLaunch((s) => s.open);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  useEffect(() => {
    if (!pickingKey) return;
    // Architects run locally, so only local variants are offered. Captured
    // centrally on failure.
    void window.hiveryn.profiles
      .list()
      .then((list) => setProfiles(profilesForMachine(list, '')))
      .catch(() => {});
  }, [pickingKey]);

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

  // Filesystem reconciliation also refreshes an already-open detail dialog.
  const selectedTicketId = selectedTicket?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: board changes include body-only filesystem edits.
  useEffect(() => {
    if (!architectKey || !selectedTicketId) return;
    let current = true;
    const requestId = ++ticketRequestId.current;
    void window.hiveryn.tickets.get(architectKey, selectedTicketId).then(
      (ticket) => {
        if (current && requestId === ticketRequestId.current) setSelectedTicket(ticket);
      },
      () => {
        if (current && requestId === ticketRequestId.current) setSelectedTicket(null);
      },
    );
    return () => {
      current = false;
    };
  }, [architectKey, selectedTicketId, board]);

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
  // sessions or projects must dismiss it, not carry it into the next one.
  // Bump the request id so any in-flight tickets.get resolves as stale.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeSessionId and architectKey are triggers, not read inside — the effect must re-run on every switch.
  useEffect(() => {
    ticketRequestId.current += 1;
    setSelectedTicket(null);
    setSpawnRequest(null);
  }, [activeSessionId, architectKey]);

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
              {architectKey ? projectName : 'HIVERYN'}
            </Text>
            {sessionTitle ? (
              <>
                <span className={styles.navSep} aria-hidden="true">
                  ›
                </span>
                <Text as="span" className={styles.navSession}>
                  {sessionTitle}
                </Text>
              </>
            ) : null}
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
          <div className={styles.appbarActions}>
            <IconButton
              onClick={() => setLauncherOpen(true)}
              aria-label="Open architects"
              title="Open architects"
            >
              <Glyph>
                <Plus />
              </Glyph>
            </IconButton>
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
          </div>
        }
      />

      <div className={styles.body}>
        <SessionSidebar onConclude={setConcludeTarget} onRecoverCompanion={setRecoveryTarget} />

        <main className={styles.content}>
          {architectKey ? (
            <div className={styles.contentStack}>
              {loadError ? (
                <div className={styles.loadErrorBanner} role="alert">
                  <Text as="span">Failed to load {architectKey} — see error center</Text>
                  <Button theme="SECONDARY" onClick={() => void retryLoad()}>
                    Retry
                  </Button>
                </div>
              ) : null}
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
                  {!activeSessionId && (
                    <div className={styles.projectEmpty}>
                      {architectStatus?.session_id || architectStatus?.sessions.length ? (
                        <Caption>Loading sessions of {projectName}…</Caption>
                      ) : (
                        <>
                          <Caption>No session running for {projectName}</Caption>
                          {architectStatus && (
                            <div className={styles.projectEmptyAction}>
                              <Button onClick={() => void openArchitect(architectStatus)}>
                                Launch architect session
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <AgentMessagesStrip architectKey={architectKey} />
                  <QuestionPanel sessionId={activeSessionId} />
                </div>
                <div
                  className={styles.rightPane}
                  data-focused={isRightFocused || undefined}
                  data-maximized={isRightMaximized || undefined}
                >
                  <ErrorBoundary paneLabel="Right Pane" resetKeys={[activeSessionId]}>
                    <RightPane
                      architectKey={architectKey}
                      board={board}
                      boardQuery={boardQuery}
                      boardLoaded={boardLoaded}
                      boardLoading={boardLoading}
                      boardError={boardError}
                      shortcutConfig={shortcutConfig}
                      onTicketSelect={handleTicketSelect}
                      onSpawnTicket={handleSpawnTicket}
                      onRefreshBoard={() => void refreshBoard()}
                      onSearchBoard={searchBoard}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          ) : (
            <ArchitectLauncherView />
          )}
        </main>
      </div>

      {openArchitects.map((key) => (
        <ProjectSessionSync key={key} architectKey={key} />
      ))}

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

      {recoveryTarget && (
        <CompanionRecoveryDialog target={recoveryTarget} onClose={() => setRecoveryTarget(null)} />
      )}
      {concludeTarget && (
        <ConcludeSessionDialog session={concludeTarget} onClose={() => setConcludeTarget(null)} />
      )}

      {shortcutsOpen && shortcutConfig && (
        <ShortcutsDialog config={shortcutConfig} onClose={() => setShortcutsOpen(false)} />
      )}

      {launcherOpen && <ArchitectLauncherDialog onClose={() => setLauncherOpen(false)} />}

      <ProfileSelector
        profiles={profiles}
        emptyLabel={noVariantMessage('')}
        open={pickingKey !== null}
        onSelect={(name: string) => void launchArchitect(name)}
        onClose={cancelPick}
      />

      {maximizedPane !== null && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses maximize
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard dismiss handled by dispatcher Escape
        <div className={styles.backdrop} onClick={() => setMaximizedPane(null)} />
      )}

      <IntentCenter architectKey={architectKey} />
      <ActionCenter architectKey={architectKey || null} />
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
