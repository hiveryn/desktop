import { Close } from '@components';
import type { SessionTab } from '@hiveryn/shared/domain';
import { type CSSProperties, useMemo } from 'react';
import { useSessionStore } from '../../../state/sessionStore';
import { refreshSessionFromDaemon } from '../hooks/sessionSnapshot';
import SessionTerminal from '../SessionTerminal';
import styles from './terminal-stack.module.css';

interface Props {
  onCloseTerminal: (sessionId: string, terminalId: string) => void;
}

// Renders every terminal tab across all sessions as persistent siblings and
// shows the active session's selected one. Keeping them all mounted means a tab
// switch never tears down an xterm (a remount forces a reconnect + replay that
// flashes black); visibility (below) picks which one shows.
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
        const isActiveSession = session.id === activeSessionId;
        const isVisible = isActiveSession && activeRightTab === terminalId;
        const isFocused = isVisible && focusedPane === `right-terminal:${terminalId}`;
        const canClose = tab.status !== 'exited';
        // Active-session terminals stay laid out in
        // stacked slots (.extraSlot is position:absolute; inset:0) and switch via
        // visibility, never display:none. Staying laid out keeps each pane fitted
        // to a real box the whole time, so xterm never sees a 0×0 container, never
        // pauses its renderer, and never resumes against stale geometry — the
        // cause of the black/garbled-on-switch bug. Inactive sessions drop to display:none so they stop rendering in the background.
        const slotStyle: CSSProperties = isActiveSession
          ? { visibility: isVisible ? 'visible' : 'hidden' }
          : { display: 'none' };
        return (
          <div key={`${session.id}:${terminalId}`} className={styles.extraSlot} style={slotStyle}>
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
