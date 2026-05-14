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
  const removeTerminal = useSessionStore((s) => s.removeTerminal);
  const setActiveRightTab = useSessionStore((s) => s.setActiveRightTab);

  const extras = useMemo(
    () =>
      Object.values(sessions).flatMap((session) =>
        Object.values(session.terminals)
          .filter((t) => t.name !== 'main')
          .map((terminal) => ({ session, terminal })),
      ),
    [sessions],
  );

  return (
    <>
      {extras.map(({ session, terminal }) => {
        const isVisible = session.id === activeSessionId && activeRightTab === terminal.name;
        return (
          <div
            key={`${session.id}:${terminal.name}`}
            className={styles.extraSlot}
            style={{ display: isVisible ? 'flex' : 'none' }}
          >
            <SessionTerminal
              sessionId={session.id}
              wsUrl={terminal.wsUrl}
              terminalName={terminal.name}
              visible={isVisible}
              onDisconnected={() => {
                removeTerminal(session.id, terminal.name);
                if (
                  useSessionStore.getState().activeSessionId === session.id &&
                  useSessionStore.getState().activeRightTab === terminal.name
                ) {
                  setActiveRightTab('kanban');
                }
              }}
            />
          </div>
        );
      })}
    </>
  );
}
