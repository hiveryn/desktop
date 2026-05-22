import { ApiEnvelopeError, TerminalPane } from '@components';
import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../state/sessionStore';

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

// ESC c = RIS (Reset to Initial State): clears screen, exits alt-screen,
// resets parser. Sent before reconnecting so the daemon's replay lands on a
// clean xterm state rather than overlaying a corrupted/partial frame.
const TERMINAL_FULL_RESET = new Uint8Array([0x1b, 0x63]);

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
  const writeRef = useRef<((data: string | Uint8Array) => void) | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  // Guards against overlapping reconnect attempts on rapid close events.
  const reconnectingRef = useRef(false);

  useEffect(() => {
    onConnectedRef.current = onConnected;
    onDisconnectedRef.current = onDisconnected;
  });

  useEffect(() => {
    return window.hiveryn.session.onData(({ sessionId: sid, terminalId: tid, data }) => {
      if (sid !== sessionId || tid !== terminalId) return;
      writeRef.current?.(data);
    });
  }, [sessionId, terminalId]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        await window.hiveryn.session.connect(sessionId, terminalId);
        if (cancelled) return;
        if (lastSizeRef.current) {
          window.hiveryn.session.resize(
            sessionId,
            terminalId,
            lastSizeRef.current.cols,
            lastSizeRef.current.rows,
          );
        }
        onConnectedRef.current?.(sessionId);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err);
        onDisconnectedRef.current?.();
      }
    }

    connect();

    return () => {
      cancelled = true;
    };
  }, [sessionId, terminalId]);

  useEffect(() => {
    return window.hiveryn.session.onTerminalClosed(({ sessionId: sid, terminalId: tid }) => {
      if (sid !== sessionId || tid !== terminalId) return;

      // Always refresh session state so the UI reflects the latest status.
      onDisconnectedRef.current?.();

      // Auto-reconnect. The daemon closed the WS — most likely because
      // backpressure caused the subscriber channel to fill, or a transient
      // network hiccup. Reconnecting re-attaches and receives the daemon's
      // replay buffer + DEC mode state, restoring the screen cleanly.
      //
      // If the terminal PROCESS exited, session.connect() will fail with
      // "terminal not running" and we silently ignore it — the daemon fires
      // main_terminal_resumed, which updates mainTerminalId in the store and
      // mounts a fresh SessionTerminal with the new ID.
      if (reconnectingRef.current) return;
      reconnectingRef.current = true;

      // ESC c before reconnect: resets xterm's parser and clears the screen
      // so the incoming replay paints on a clean slate rather than overlaying
      // whatever partial/corrupted state was frozen when the WS dropped.
      writeRef.current?.(TERMINAL_FULL_RESET);

      void (async () => {
        try {
          await window.hiveryn.session.connect(sessionId, terminalId);
          if (lastSizeRef.current) {
            window.hiveryn.session.resize(
              sessionId,
              terminalId,
              lastSizeRef.current.cols,
              lastSizeRef.current.rows,
            );
          }
          onConnectedRef.current?.(sessionId);
        } catch (err: unknown) {
          // "terminal not running" means the process exited normally;
          // main_terminal_resumed handles that case, so don't surface an error.
          const message = err instanceof Error ? err.message : String(err);
          if (
            !message.toLowerCase().includes('terminal is not running') &&
            !message.toLowerCase().includes('terminal not found')
          ) {
            console.error('[SessionTerminal] reconnect failed', { sessionId, terminalId, err });
          }
        } finally {
          reconnectingRef.current = false;
        }
      })();
    });
  }, [sessionId, terminalId]);

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          display: visible ? 'flex' : 'none',
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
        display: visible ? 'flex' : 'none',
        minHeight: 0,
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <TerminalPane
        className={className}
        visible={visible}
        focused={focused}
        style={{ flex: 1, minHeight: 0, height: 'auto' }}
        onWrite={(fn: (data: string | Uint8Array) => void) => {
          writeRef.current = fn;
        }}
        onData={(data: string) => window.hiveryn.session.send(sessionId, terminalId, data)}
        onResize={(cols: number, rows: number) => {
          if (cols <= 0 || rows <= 0) return;
          lastSizeRef.current = { cols, rows };
          window.hiveryn.session.resize(sessionId, terminalId, cols, rows);
        }}
        onTextAreaFocus={() => {
          const state = useSessionStore.getState();
          if (state.focusedPane !== paneId) state.setFocusedPane(paneId);
        }}
      />
    </div>
  );
}
