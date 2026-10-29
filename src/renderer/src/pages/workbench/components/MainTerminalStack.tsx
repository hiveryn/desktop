import { Caption, ErrorBoundary } from '@components';
import { useMemo } from 'react';
import { useSessionStore } from '../../../state/sessionStore';
import { refreshSessionFromDaemon } from '../hooks/sessionSnapshot';
import SessionTerminal from '../SessionTerminal';
import styles from './terminal-stack.module.css';

interface Props {
  className?: string;
}

// Renders the main terminal of every session in the workbench — across all open
// projects — as a persistent sibling. Exactly one is visible at a time, picked
// by activeSessionId. Inactive ones stay mounted (display:none, so they pause
// and release their WebGL context) to preserve scrollback and avoid a reconnect
// + replay when switching sessions or projects.
export default function MainTerminalStack({ className }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const focusedPane = useSessionStore((s) => s.focusedPane);

  const mains = useMemo(
    () =>
      Object.values(sessions).map((session) => ({ session, terminalId: session.mainTerminalId })),
    [sessions],
  );

  const showDisconnected = activeSessionId === null;

  return (
    <div className={[styles.stack, className].filter(Boolean).join(' ')}>
      {mains.map(({ session, terminalId }) => {
        const isVisible = session.id === activeSessionId;
        const isFocused = isVisible && focusedPane === 'main-terminal';
        // One main per session and only ever switched by activating a different
        // session, so a plain display toggle is fine here — there is no
        // tab-switch-within-a-pane path to leave a hidden main with stale
        // geometry. The slot (not SessionTerminal) owns the hide.
        return (
          <div
            key={`${session.id}:${terminalId}`}
            data-pane-slot="main-terminal"
            data-visible={isVisible}
            style={{
              flex: 1,
              display: isVisible ? 'flex' : 'none',
              minHeight: 0,
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {session.machine && (
              <Caption role="status">
                {session.machine} ·{' '}
                {session.connection === 'connected'
                  ? 'Connected'
                  : session.connection === 'missing'
                    ? 'Remote worker unavailable'
                    : 'Disconnected — remote worker may still be running; activity is stale.'}
                {session.connectionMessage && ` ${session.connectionMessage}`}
              </Caption>
            )}
            {session.interactionMode === 'chat' ? (
              <Caption role="status">
                Chat session · {session.status || 'Starting'}. Use the conversation API. Questions
                and approvals appear here.
              </Caption>
            ) : (
              <ErrorBoundary paneLabel="Terminal" resetKeys={[session.id, terminalId]}>
                <SessionTerminal
                  sessionId={session.id}
                  terminalId={terminalId}
                  paneId="main-terminal"
                  visible={isVisible}
                  focused={isFocused}
                  onDisconnected={() => {
                    void refreshSessionFromDaemon(session.id);
                  }}
                />
              </ErrorBoundary>
            )}
          </div>
        );
      })}

      {showDisconnected && (
        <div className={styles.disconnectedPane}>
          <Caption>No running session</Caption>
        </div>
      )}
    </div>
  );
}
