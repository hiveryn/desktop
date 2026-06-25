import { useEffect, useRef } from 'react';
import TerminalView from './TerminalView';
import type { GpuCrashSource, RouteKey, TerminalThemeSource, TerminalTransport } from './types';

export interface TerminalSessionProps {
  // The transport this terminal is bound to. sessionId/terminalId are already
  // closed over by the adapter; the session only sees an opaque byte/string pipe.
  transport: TerminalTransport;
  themeSource: TerminalThemeSource;
  routeKey: RouteKey;
  gpuCrash: GpuCrashSource;
  className?: string;
  visible?: boolean;
  focused?: boolean;
  // Connected/disconnected lifecycle, surfaced to the host for UI state.
  onConnected?: () => void;
  onDisconnected?: () => void;
  // A connect attempt failed. The host decides how to render it (the module
  // carries no design-system dependency).
  onError?: (err: unknown) => void;
  // The xterm helper textarea gained DOM focus — host claims keyboard focus.
  onTextAreaFocus?: () => void;
}

// ESC c = RIS (Reset to Initial State): clears screen, exits alt-screen,
// resets parser. Sent before reconnecting so the backend's replay lands on a
// clean xterm state rather than overlaying a corrupted/partial frame.
const TERMINAL_FULL_RESET = new Uint8Array([0x1b, 0x63]);

// Drives the transport lifecycle (connect, reconnect, attach-time size
// handshake) over the injected TerminalTransport and renders the xterm view.
// Transport-agnostic: no Electron/IPC knowledge lives here.
export default function TerminalSession({
  transport,
  themeSource,
  routeKey,
  gpuCrash,
  className,
  visible = true,
  focused = true,
  onConnected,
  onDisconnected,
  onError,
  onTextAreaFocus,
}: TerminalSessionProps) {
  const writeRef = useRef<((data: string | Uint8Array) => void) | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onErrorRef = useRef(onError);
  // Guards against overlapping reconnect attempts on rapid close events.
  const reconnectingRef = useRef(false);

  useEffect(() => {
    onConnectedRef.current = onConnected;
    onDisconnectedRef.current = onDisconnected;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    return transport.onData((data) => {
      writeRef.current?.(data);
    });
  }, [transport]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        // Attach-time size handshake: the backend resizes the PTY to our grid
        // before streaming starts, so PTY ↔ xterm reconcile on every connect.
        // lastSizeRef is set by TerminalView's mount fit (child effects run
        // before parent effects), so it's populated here whenever the pane is
        // visible. Hidden panes connect without a size; the visibility fit
        // sends a resize when they're first shown.
        await transport.connect(lastSizeRef.current ?? undefined);
        if (cancelled) return;
        onConnectedRef.current?.();
      } catch (err: unknown) {
        if (cancelled) return;
        onErrorRef.current?.(err);
        onDisconnectedRef.current?.();
      }
    }

    connect();

    return () => {
      cancelled = true;
    };
  }, [transport]);

  useEffect(() => {
    return transport.onClosed(() => {
      // Always refresh session state so the UI reflects the latest status.
      onDisconnectedRef.current?.();

      // Auto-reconnect. The backend closed the stream — most likely because
      // backpressure caused the subscriber channel to fill, or a transient
      // network hiccup. Reconnecting re-attaches and receives the backend's
      // replay buffer + DEC mode state, restoring the screen cleanly.
      //
      // If the terminal PROCESS exited, transport.connect() will fail with
      // "terminal not running" and the host handles it (e.g. the daemon fires
      // main_terminal_resumed, which remounts a fresh session with the new ID).
      if (reconnectingRef.current) return;
      reconnectingRef.current = true;

      // ESC c before reconnect: resets xterm's parser and clears the screen
      // so the incoming replay paints on a clean slate rather than overlaying
      // whatever partial/corrupted state was frozen when the stream dropped.
      writeRef.current?.(TERMINAL_FULL_RESET);

      void (async () => {
        try {
          // Same attach-time size handshake as the initial connect — critical
          // here because backend restarts restore PTYs at the 80×24 default;
          // reconnecting with our grid reconciles the size immediately.
          await transport.connect(lastSizeRef.current ?? undefined);
          onConnectedRef.current?.();
        } catch (err: unknown) {
          // Surface the failure instead of leaving a silently-frozen pane
          // showing stale content over a dead stream. When a main terminal
          // process exited normally, the host remounts this component under a
          // new terminal ID, replacing the error pane; a closed aux terminal is
          // removed from the tab list, unmounting it. Anything else is a real
          // failure the developer must see.
          console.error('[TerminalSession] reconnect failed', err);
          onErrorRef.current?.(err);
        } finally {
          reconnectingRef.current = false;
        }
      })();
    });
  }, [transport]);

  return (
    <TerminalView
      className={className}
      visible={visible}
      focused={focused}
      themeSource={themeSource}
      routeKey={routeKey}
      gpuCrash={gpuCrash}
      style={{ flex: 1, minHeight: 0, height: 'auto' }}
      onWrite={(fn) => {
        writeRef.current = fn;
      }}
      onData={(data) => transport.send(data)}
      onResize={(cols, rows) => {
        if (cols <= 0 || rows <= 0) return;
        lastSizeRef.current = { cols, rows };
        transport.resize(cols, rows);
      }}
      onTextAreaFocus={onTextAreaFocus}
    />
  );
}
