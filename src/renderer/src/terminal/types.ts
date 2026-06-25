import type { ITheme } from '@xterm/xterm';

// The injected dependencies that decouple the terminal from any particular host
// environment. The module renders xterm and drives its lifecycle; everything
// platform-specific (Electron IPC transport, CSS-variable theming, the app
// keyboard dispatcher, the GPU-crash event) is supplied through these
// interfaces. Keep this file type-only so the module has no runtime edges into
// the host.

// Transport: the WS contract, with sessionId/terminalId bound at construction
// so the module never sees routing ids. The adapter that builds it owns the
// `?cols=&rows=` attach handshake, the binary-out/text-in framing, and the
// per-(session,terminal) filtering.
export interface TerminalTransport {
  // Attach-time size handshake: the backend resizes the PTY to this grid before
  // streaming, so PTY <-> view reconcile on every (re)connect.
  connect(size?: { cols: number; rows: number }): Promise<void>;
  // User input → PTY.
  send(data: string): void;
  // Grid changed → PTY (SIGWINCH).
  resize(cols: number, rows: number): void;
  // PTY output → view. `Uint8Array` is the right type for raw bytes that may
  // split a UTF-8 sequence at a chunk boundary. Returns an unsubscribe.
  onData(cb: (data: string | Uint8Array) => void): () => void;
  // The backend closed the stream (process exit, backpressure, network drop).
  // Returns an unsubscribe.
  onClosed(cb: () => void): () => void;
}

// Theme: a live getter, not a snapshot. The view re-reads at construction and
// again on `document.fonts.ready`, so a theme switch is reflected without the
// host having to re-render the view.
export interface TerminalThemeSource {
  readTheme(): ITheme;
  readFontFamily(): string;
}

// Keyboard: app-shortcut routing ONLY. Returns whether an app shortcut consumed
// the event. Terminal input mechanics (Shift+Enter→LF, keypress double-fire
// suppression) live inside the module, not here.
export type RouteKey = (event: KeyboardEvent) => 'consumed' | 'passthrough';

// GPU crash: subscribe, returns an unsubscribe. Fires when the host's GPU
// process restarts and every WebGL context is destroyed.
export type GpuCrashSource = (cb: () => void) => () => void;
