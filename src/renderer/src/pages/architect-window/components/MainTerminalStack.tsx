import { Button, Caption } from '@hiveryn/components';
import { useMemo } from 'react';
import { useSessionStore } from '../../../state/sessionStore';
import SessionTerminal from '../SessionTerminal';
import styles from './terminal-stack.module.css';

interface Props {
  // Whether the parent pane is currently visible. Used to suppress fitting
  // when the whole pane is hidden (e.g., in compact mode when not on 'terminal' tab).
  paneVisible: boolean;
  className?: string;
}

// Renders every session's main terminal as a persistent sibling. Exactly one is
// visible at a time, picked by activeSessionId. Inactive ones stay mounted to
// preserve scrollback and avoid black-screen-on-tab-switch.
export default function MainTerminalStack({ paneVisible, className }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const focusedPane = useSessionStore((s) => s.focusedPane);
  const unregisterSession = useSessionStore((s) => s.unregisterSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const mains = useMemo(
    () =>
      Object.values(sessions).map((session) => ({ session, terminalId: session.mainTerminalId })),
    [sessions],
  );

  const showDisconnected = paneVisible && (activeSessionId === null || mains.length === 0);

  return (
    <div className={[styles.stack, className].filter(Boolean).join(' ')}>
      {mains.map(({ session, terminalId }) => {
        const isVisible = paneVisible && session.id === activeSessionId;
        const isFocused = isVisible && focusedPane === 'main-terminal';
        return (
          <SessionTerminal
            key={`${session.id}:${terminalId}`}
            sessionId={session.id}
            terminalId={terminalId}
            visible={isVisible}
            focused={isFocused}
            onDisconnected={() => {
              unregisterSession(session.id);
              // If the user was viewing this session, fall back to architect or null.
              const store = useSessionStore.getState();
              if (store.activeSessionId === session.id) {
                const architectId = Object.values(store.sessions).find(
                  (s) => s.type === 'architect',
                )?.id;
                setActiveSession(architectId ?? null);
              }
            }}
          />
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
