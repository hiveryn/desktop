import {
  BottomBar,
  Caption,
  DevBadge,
  Dialog,
  ErrorBoundary,
  ErrorCenterIndicator,
  ErrorCenterSheet,
  Navigation,
  Text,
  WorkdirSelector,
} from '@components';
import type {
  ActionRun,
  LaunchActionResult,
  TerminalWorkdir,
  TicketBoard,
} from '@hiveryn/shared/domain';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentProfile, Architect } from '../../../../shared/types';
import { useErrorCenterCapture } from '../../hooks/useErrorCenterCapture';
import { useShortcutConfig } from '../../hooks/useShortcutConfig';
import { useKeyDispatcher } from '../../keys/useKeyDispatcher';
import { type SessionRecord, useSessionStore } from '../../state/sessionStore';
import type { RootOption } from '../architect-window/components/files/RootPicker';
import MainTerminalStack from '../architect-window/components/MainTerminalStack';
import RightPane from '../architect-window/components/RightPane';
import { useSessionEvents } from '../architect-window/hooks/useSessionEvents';
import layout from '../architect-window/index.module.css';
import {
  createSelectedTerminal,
  TERMINAL_WORKDIR_REQUEST,
  type TerminalCreationRequest,
} from '../architect-window/terminalWorkdirPicker';
import { defaultActionName } from './actionsModel';
import ActionRunDetail from './components/ActionRunDetail';
import ActionsBottomTabs from './components/ActionsBottomTabs';
import ActionsHome from './components/ActionsHome';
import styles from './components/actions.module.css';
import { useActionsData } from './hooks/useActionsData';
import { useOpenSessionRequest } from './hooks/useOpenSessionRequest';

const EMPTY_BOARD: TicketBoard = { backlog: [], progress: [], done: [] };

/**
 * The global Actions window. The home tab lists the Action library, launches
 * an execution with a prompt and an agent variant, and keeps every execution
 * browsable. Each running execution is a bottom tab with the familiar layout:
 * the agent terminal on the left (follow up with the agent there), context
 * tabs on the right — the execution, its output folder and repository, and
 * the event log.
 */
export default function ActionsWindow() {
  const { list, runs, refresh } = useActionsData();
  useSessionEvents();
  useErrorCenterCapture();
  const { config: shortcutConfig } = useShortcutConfig();
  useKeyDispatcher(shortcutConfig);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const focusedPane = useSessionStore((s) => s.focusedPane);
  const setFocusedPane = useSessionStore((s) => s.setFocusedPane);
  const maximizedPane = useSessionStore((s) => s.maximizedPane);
  const setMaximizedPane = useSessionStore((s) => s.setMaximizedPane);

  const [view, setView] = useState<'home' | 'session'>('home');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [stopTarget, setStopTarget] = useState<ActionRun | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);

  useEffect(() => {
    void window.hiveryn.profiles.list().then(setProfiles, () => undefined);
  }, []);

  useEffect(() => {
    if (selectedAction === null && list) setSelectedAction(defaultActionName(list.actions));
  }, [list, selectedAction]);

  const runsById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);
  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const activeRun = activeSession ? runsById.get(activeSession.contextId) : undefined;

  // A session view whose session ended (concluded, cancelled or failed) falls
  // back to the home tab, showing that execution's result.
  useEffect(() => {
    if (view === 'session' && !activeSession) setView('home');
  }, [view, activeSession]);

  const openSession = useCallback((sessionId: string) => {
    const store = useSessionStore.getState();
    if (!store.sessions[sessionId]) return;
    store.setActiveSession(sessionId);
    store.setFocusedPane('main-terminal');
    setSelectedRunId(store.sessions[sessionId].contextId);
    setView('session');
  }, []);

  const handleLaunched = useCallback(
    async (result: LaunchActionResult) => {
      setSelectedRunId(result.run.id);
      await refresh();
      openSession(result.session.id);
    },
    [refresh, openSession],
  );

  // The command palette's running-execution rows land here.
  useOpenSessionRequest(openSession, refresh);

  const requestStop = useCallback(
    (session: SessionRecord) => {
      const run = runsById.get(session.contextId);
      if (run) setStopTarget(run);
    },
    [runsById],
  );

  async function confirmStop(): Promise<void> {
    const run = stopTarget;
    if (!run) return;
    try {
      await window.hiveryn.actions.cancel(run.id);
      setStopTarget(null);
      setStopError(null);
      setSelectedRunId(run.id);
      await refresh();
    } catch (error) {
      setStopError(error instanceof Error ? error.message : String(error));
    }
  }

  // Files for the active execution: its output folder first, then its repo.
  const filesRoot = useMemo<Architect | null>(
    () => (activeRun ? { key: '', name: 'Output folder', path: activeRun.output_dir } : null),
    [activeRun],
  );
  const extraFileRoots = useMemo<RootOption[]>(
    () =>
      activeRun
        ? [
            {
              id: 'action-repo',
              label: 'Action repository',
              path: activeRun.repo_path,
              kind: 'custom',
            },
          ]
        : [],
    [activeRun],
  );
  const extraPanels = useMemo(
    () => ({
      action: activeRun ? (
        <div className={styles.detailPane}>
          <ActionRunDetail run={activeRun} onCancel={setStopTarget} />
        </div>
      ) : null,
    }),
    [activeRun],
  );

  // New terminals (Cmd+T / the right tab bar's +) ask which workdir to use.
  const [terminalRequest, setTerminalRequest] = useState<TerminalCreationRequest | null>(null);
  const [terminalWorkdirs, setTerminalWorkdirs] = useState<TerminalWorkdir[]>([]);
  useEffect(() => {
    const listener = (event: Event) => {
      const request = (event as CustomEvent<TerminalCreationRequest>).detail;
      setTerminalRequest(request);
      void window.hiveryn.terminals
        .listWorkdirs(request.sessionId)
        .then(setTerminalWorkdirs)
        .catch(() => setTerminalRequest(null));
    };
    window.addEventListener(TERMINAL_WORKDIR_REQUEST, listener);
    return () => window.removeEventListener(TERMINAL_WORKDIR_REQUEST, listener);
  }, []);

  const showSession = view === 'session' && activeSession !== undefined;
  const isLeftFocused = focusedPane === 'main-terminal';
  const isRightFocused = focusedPane.startsWith('right-');

  return (
    <div className={layout.window}>
      <Navigation
        className={layout.appbar}
        left={
          <div className={layout.navTitle}>
            <Text as="span" className={layout.architectTitle}>
              ACTIONS
            </Text>
            {list ? (
              <>
                <span className={layout.navSep} aria-hidden="true">
                  ·
                </span>
                <Caption className={layout.navPath}>{list.root}</Caption>
              </>
            ) : null}
            <DevBadge />
          </div>
        }
      />

      <main className={layout.content}>
        <div className={layout.contentStack}>
          {/* The session layout stays mounted so terminals keep their scrollback. */}
          <div className={layout.splitPane} style={showSession ? undefined : { display: 'none' }}>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: click tracks keyboard focus state; global keydown handles actual keyboard nav */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
            <div
              className={layout.leftPane}
              data-focused={(showSession && isLeftFocused) || undefined}
              data-maximized={maximizedPane === 'main-terminal' || undefined}
              onClick={() => setFocusedPane('main-terminal')}
            >
              <MainTerminalStack className={layout.terminal} />
            </div>
            <div
              className={layout.rightPane}
              data-focused={(showSession && isRightFocused) || undefined}
              data-maximized={maximizedPane?.startsWith('right-') || undefined}
            >
              <ErrorBoundary paneLabel="Right Pane" resetKeys={[activeSessionId]}>
                <RightPane
                  architectKey=""
                  architect={filesRoot}
                  board={EMPTY_BOARD}
                  boardLoading={false}
                  boardError={null}
                  isMaximized={maximizedPane?.startsWith('right-') ?? false}
                  shortcutConfig={shortcutConfig}
                  onTicketSelect={() => undefined}
                  onSpawnTicket={() => undefined}
                  onRefreshBoard={() => undefined}
                  extraPanels={extraPanels}
                  extraFileRoots={extraFileRoots}
                />
              </ErrorBoundary>
            </div>
          </div>
          {showSession ? null : (
            <ErrorBoundary paneLabel="Actions">
              <ActionsHome
                list={list}
                runs={runs}
                profiles={profiles}
                selectedAction={selectedAction}
                onSelectAction={(name) => {
                  setSelectedAction(name);
                  setSelectedRunId(null);
                }}
                selectedRunId={selectedRunId}
                onSelectRun={(id) => {
                  const run = id ? runsById.get(id) : undefined;
                  if (run) setSelectedAction(run.action);
                  setSelectedRunId(id);
                }}
                onLaunched={(result) => void handleLaunched(result)}
                onOpenSession={openSession}
                onCancel={setStopTarget}
              />
            </ErrorBoundary>
          )}
        </div>
      </main>

      <BottomBar
        className={layout.bottomBar}
        left={
          <ActionsBottomTabs
            homeActive={!showSession}
            onHome={() => {
              if (activeRun) setSelectedRunId(activeRun.id);
              setView('home');
            }}
            onSession={openSession}
            onStop={requestStop}
          />
        }
        right={<ErrorCenterIndicator />}
      />

      {stopTarget ? (
        <Dialog
          title={`Stop ${stopTarget.action}?`}
          intent="destructive"
          confirmLabel="Stop execution"
          onConfirm={() => void confirmStop()}
          onCancel={() => {
            setStopTarget(null);
            setStopError(null);
          }}
        >
          <p>
            The agent is stopped and execution {stopTarget.id} is recorded as failed (cancelled by
            user). Its output folder is kept.
          </p>
          {stopError ? <p className={styles.errorText}>{stopError}</p> : null}
        </Dialog>
      ) : null}

      {maximizedPane !== null && showSession && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses maximize
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard dismiss handled by dispatcher Escape
        <div className={layout.backdrop} onClick={() => setMaximizedPane(null)} />
      )}

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
