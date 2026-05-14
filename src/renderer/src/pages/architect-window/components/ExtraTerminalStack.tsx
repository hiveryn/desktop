import { useMemo } from 'react';
import { useSessionStore } from '../../../state/sessionStore';
import SessionTerminal from '../SessionTerminal';
import styles from './terminal-stack.module.css';

// Renders every non-main terminal across all sessions as persistent siblings.
// Exactly one is visible at a time, picked by (activeSessionId, activeRightTab).
export default function ExtraTerminalStack() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);

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
      {extras.map(({ session, tab }) => {
        const terminalId = tab.id;
        if (!terminalId) return null;
        const isVisible = session.id === activeSessionId && activeRightTab === terminalId;
        return (
          <div
            key={`${session.id}:${terminalId}`}
            className={styles.extraSlot}
            style={{ display: isVisible ? 'flex' : 'none' }}
          >
            <SessionTerminal
              sessionId={session.id}
              terminalId={terminalId}
              visible={isVisible}
              onDisconnected={() => {
                void window.hiveryn.tabs
                  .list(session.id)
                  .then((tabs) => useSessionStore.getState().setSessionTabs(session.id, tabs))
                  .catch(() => {});
              }}
            />
          </div>
        );
      })}
    </>
  );
}
