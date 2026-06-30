import { ApiEnvelopeError } from '@components';
import { useMemo, useState } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { TerminalSession } from '../../terminal';
import { cssThemeSource } from './terminal-adapters/cssThemeSource';
import { dispatcherRouteKey } from './terminal-adapters/dispatcherRouteKey';
import { makeElectronTransport } from './terminal-adapters/electronTransport';
import { gpuCrashSource } from './terminal-adapters/gpuCrashSource';

interface Props {
  sessionId: string;
  terminalId: string;
  // The logical pane identifier that this terminal should claim when its
  // textarea receives DOM focus (e.g., 'main-terminal' or
  // `right-terminal:${terminalId}`). Keeps focusedPane state in sync with
  // user mouse clicks, not just programmatic focus transitions.
  paneId: string;
  className?: string;
  visible?: boolean;
  focused?: boolean;
  onConnected?: (sessionId: string) => void;
  onDisconnected?: () => void;
}

// Electron wiring for the transport-agnostic terminal module: builds the
// Electron-backed transport and the theme/keyboard/GPU-crash adapters, owns the
// focus-store policy and connection-error rendering, then renders the module's
// TerminalSession. All terminal behavior lives in the module.
export default function SessionTerminal({
  sessionId,
  terminalId,
  paneId,
  className,
  visible = true,
  focused = true,
  onConnected,
  onDisconnected,
}: Props) {
  const [error, setError] = useState<unknown | null>(null);

  // Bound to this pane's ids; stable for the pane's life so TerminalSession's
  // subscribe/connect effects (keyed on the transport) don't thrash.
  const transport = useMemo(
    () => makeElectronTransport(sessionId, terminalId),
    [sessionId, terminalId],
  );

  // This component fills its slot; the slot owns show/hide. Background panes are
  // hidden with visibility:hidden in a stable layout slot (see ExtraTerminalStack
  // / MainTerminalStack), so the terminal stays laid out at its real size and
  // xterm never sees a 0×0 container — the key to avoiding stale-geometry
  // corruption on tab switch. We never display:none this wrapper ourselves.
  if (error) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ApiEnvelopeError error={error} title="Terminal Connection Error" />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <TerminalSession
        transport={transport}
        themeSource={cssThemeSource}
        routeKey={dispatcherRouteKey}
        gpuCrash={gpuCrashSource}
        logLabel={`${paneId}·${sessionId.slice(0, 8)}/${terminalId.slice(0, 8)}`}
        className={className}
        visible={visible}
        focused={focused}
        onConnected={() => onConnected?.(sessionId)}
        onDisconnected={onDisconnected}
        onError={setError}
        onTextAreaFocus={() => {
          const state = useSessionStore.getState();
          if (state.focusedPane !== paneId) state.setFocusedPane(paneId);
        }}
      />
    </div>
  );
}
