import { Close } from '@components';
import type { SessionTab } from '@hiveryn/shared/domain';
import { type CSSProperties, useMemo } from 'react';
import { isSplitTerminalTab, useSessionStore } from '../../../state/sessionStore';
import { refreshSessionFromDaemon } from '../hooks/sessionSnapshot';
import SessionTerminal from '../SessionTerminal';
import styles from './terminal-stack.module.css';

interface Props {
  mode: 'primary' | 'split';
  enabled?: boolean;
  baseTabId?: string;
  onCloseTerminal: (sessionId: string, terminalId: string) => void;
}

// Renders every non-main terminal across all sessions as persistent siblings.
// Primary mode shows the active tab-bar terminal; split mode shows the active
// session's dedicated split terminal.
export default function ExtraTerminalStack({
  mode,
  enabled = true,
  baseTabId,
  onCloseTerminal,
}: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeRightTab = useSessionStore((s) => s.activeRightTab);
  const focusedPane = useSessionStore((s) => s.focusedPane);

  // Split mode renders EVERY split (not just the one for the current base tab)
  // so they stay mounted across tab switches — unmounting on switch-away and
  // remounting on switch-back tore down the xterm instance, forcing a reconnect
  // + replay that flashed black. Visibility (below) picks which one shows.
  const extras = useMemo(
    () =>
      Object.values(sessions).flatMap((session) =>
        session.tabs
          .filter(
            (tab) =>
              tab.type === 'terminal' &&
              tab.id &&
              (mode === 'split' ? isSplitTerminalTab(tab) : !isSplitTerminalTab(tab)),
          )
          .map((tab) => ({ session, tab })),
      ),
    [mode, sessions],
  );

  return (
    <>
      {extras.map(({ session, tab }: { session: { id: string }; tab: SessionTab }) => {
        const terminalId = tab.id;
        if (!terminalId) return null;
        const isActiveSession = session.id === activeSessionId;
        const isVisible =
          enabled &&
          isActiveSession &&
          (mode === 'split' ? tab.base_tab_id === baseTabId : activeRightTab === terminalId);
        const isFocused = isVisible && focusedPane === `right-terminal:${terminalId}`;
        const canClose = tab.status !== 'exited';
        // Active-session terminals (primary tabs AND splits) stay laid out in
        // stacked slots (.extraSlot is position:absolute; inset:0) and switch via
        // visibility, never display:none. Staying laid out keeps each pane fitted
        // to a real box the whole time, so xterm never sees a 0×0 container, never
        // pauses its renderer, and never resumes against stale geometry — the
        // cause of the black/garbled-on-switch bug. (The split secondary stays
        // half-sized even while hidden; see .rightPaneSplitSecondary.) Inactive
        // sessions drop to display:none so they stop rendering in the background.
        const slotStyle: CSSProperties = isActiveSession
          ? { visibility: isVisible ? 'visible' : 'hidden' }
          : { display: 'none' };
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: split terminal clicks must not bubble and steal focus back to the primary pane
          // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard focus is handled by xterm's textarea, not this wrapper div
          <div
            key={`${session.id}:${terminalId}`}
            className={styles.extraSlot}
            style={slotStyle}
            onClick={mode === 'split' ? (e) => e.stopPropagation() : undefined}
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
