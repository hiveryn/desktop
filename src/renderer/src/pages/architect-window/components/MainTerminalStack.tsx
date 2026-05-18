import { Button, Caption } from '@components';
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

async function refreshMainTerminalID(sessionId: string, terminalId: string): Promise<void> {
  const sessions = await window.hiveryn.sessions.list();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error(`Cannot refresh missing session ${sessionId}`);
  }
  if (!session.main_terminal_id) {
    throw new Error(`Session ${sessionId} is missing main_terminal_id`);
  }
  if (session.main_terminal_id === terminalId) {
    return;
  }
  useSessionStore.getState().updateSessionMainTerminal(sessionId, session.main_terminal_id);
}

// Renders every session's main terminal as a persistent sibling. Exactly one is
// visible at a time, picked by activeSessionId. Inactive ones stay mounted to
// preserve scrollback and avoid black-screen-on-tab-switch.
export default function MainTerminalStack({ paneVisible, className }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const focusedPane = useSessionStore((s) => s.focusedPane);

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
            paneId="main-terminal"
            visible={isVisible}
            focused={isFocused}
            onDisconnected={() => {
              void refreshMainTerminalID(session.id, terminalId);
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
