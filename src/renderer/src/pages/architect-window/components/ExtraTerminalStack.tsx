import { Close } from '@components';
import { useMemo } from 'react';
import type { SessionTab } from '../../../../../shared/types';
import { useSessionStore } from '../../../state/sessionStore';
import { refreshSessionFromDaemon } from '../hooks/sessionSnapshot';
import SessionTerminal from '../SessionTerminal';
import styles from './terminal-stack.module.css';

interface Props {
  onCloseTerminal: (sessionId: string, terminalId: string) => void;
}

// Renders every non-main terminal across all sessions as persistent siblings.
// Exactly one is visible at a time, picked by (activeSessionId, activeRightTab).
export default function ExtraTerminalStack({ onCloseTerminal }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);
  const focusedPane = useSessionStore((s) => s.focusedPane);

  const extras = useMemo(
    () =>
      Object.values(sessions).flatMap((session) =>
        session.tabs
          .filter((tab) => tab.type === 'terminal' && tab.id)
          .map((tab) => ({ session, tab })),
      ),
    [sessions],
  );

  return (
    <>
      {extras.map(({ session, tab }: { session: { id: string }; tab: SessionTab }) => {
        const terminalId = tab.id;
        if (!terminalId) return null;
        const isVisible = session.id === activeSessionId && activeRightTab === terminalId;
        const isFocused = isVisible && focusedPane === `right-terminal:${terminalId}`;
        const canClose = tab.status !== 'exited';
        return (
          <div
            key={`${session.id}:${terminalId}`}
            className={styles.extraSlot}
            style={{ display: isVisible ? 'flex' : 'none' }}
          >
            {canClose && (
              <button
                type="button"
                className={styles.floatingClose}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTerminal(session.id, terminalId);
                }}
                aria-label="Close terminal"
              >
                <Close />
              </button>
            )}
            <SessionTerminal
              sessionId={session.id}
              terminalId={terminalId}
              paneId={`right-terminal:${terminalId}`}
              visible={isVisible}
              focused={isFocused}
              onDisconnected={() => {
                void refreshSessionFromDaemon(session.id);
              }}
            />
          </div>
        );
      })}
    </>
  );
}
