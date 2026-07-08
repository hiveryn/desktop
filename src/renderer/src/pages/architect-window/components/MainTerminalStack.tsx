import { Button, Caption, ErrorBoundary } from '@components';
import { useMemo } from 'react';
import { useSessionStore } from '../../../state/sessionStore';
import { refreshSessionFromDaemon } from '../hooks/sessionSnapshot';
import SessionTerminal from '../SessionTerminal';
import styles from './terminal-stack.module.css';

interface Props {
  className?: string;
}

// Renders every session's main terminal as a persistent sibling. Exactly one is
// visible at a time, picked by activeSessionId. Inactive ones stay mounted to
// preserve scrollback and avoid black-screen-on-tab-switch.
export default function MainTerminalStack({ className }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const focusedPane = useSessionStore((s) => s.focusedPane);

  const mains = useMemo(
    () =>
      Object.values(sessions).map((session) => ({ session, terminalId: session.mainTerminalId })),
    [sessions],
  );

  const showDisconnected = activeSessionId === null || mains.length === 0;

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
            style={{
              flex: 1,
              display: isVisible ? 'flex' : 'none',
              minHeight: 0,
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
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
          </div>
        );
      })}

      {showDisconnected && (
        <div className={styles.disconnectedPane}>
          <Caption>No active session</Caption>
          <Button onClick={() => void window.hiveryn.architect.openLauncher()}>
            Return to Launcher
          </Button>
        </div>
      )}
    </div>
  );
}
