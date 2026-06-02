import * as React from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import styles from './TerminalPane.module.css';
import { dispatch } from '../../keys/dispatcher';

export interface TerminalPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  // Consumer receives a write function to push data into the terminal. Accepts
  // string or Uint8Array — the latter is the right type for raw PTY bytes that
  // may include partial UTF-8 sequences at chunk boundaries.
  onWrite?: (writeFn: (data: string | Uint8Array) => void) => void;
  // Fires when the user types — wire to useTerminalInteractive or a PTY
  onData?: (data: string) => void;
  // Fires when the terminal resizes — send cols/rows to the PTY/daemon
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
  cursorBlink?: boolean;
  // Disables stdin (user cannot type)
  readonly?: boolean;
  // When this transitions to true (the pane was hidden, now shown), the
  // terminal re-fits and refreshes synchronously to avoid a black-screen
  // window between display:flex landing and the next ResizeObserver tick.
  visible?: boolean;
  // Controls whether xterm holds keyboard focus. When false, term.blur() is
  // called so keystrokes don't reach the PTY (used when another pane has
  // logical keyboard focus). Defaults to true for backward compatibility.
  focused?: boolean;
  // Fires when the xterm helper textarea receives DOM focus. The architect
  // window listens for this so a mouse click on the terminal updates
  // focusedPane in the session store (single source of truth for focus).
  onTextAreaFocus?: () => void;
}

// Read theme tokens from CSS variables so xterm's palette tracks the global
// design system. Re-reads on every theme change.
function readTerminalTheme(): ITheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    foreground:          v('--theme-text'),
    background:          v('--theme-background'),
    cursor:              v('--theme-cursor'),
    cursorAccent:        v('--theme-cursor-accent'),
    selectionBackground: v('--theme-terminal-selection'),
    black:               v('--theme-ansi-black'),
    red:                 v('--theme-ansi-red'),
    green:               v('--theme-ansi-green'),
    yellow:              v('--theme-ansi-yellow'),
    blue:                v('--theme-ansi-blue'),
    magenta:             v('--theme-ansi-magenta'),
    cyan:                v('--theme-ansi-cyan'),
    white:               v('--theme-ansi-white'),
    brightBlack:         v('--theme-ansi-bright-black'),
    brightRed:           v('--theme-ansi-bright-red'),
    brightGreen:         v('--theme-ansi-bright-green'),
    brightYellow:        v('--theme-ansi-bright-yellow'),
    brightBlue:          v('--theme-ansi-bright-blue'),
    brightMagenta:       v('--theme-ansi-bright-magenta'),
    brightCyan:          v('--theme-ansi-bright-cyan'),
    brightWhite:         v('--theme-ansi-bright-white'),
  };
}

// Returns true when xterm's _keyDown will emit a character to the PTY for this
// event. When true, the corresponding keypress must be suppressed to avoid a
// double-fire (Chromium does not suppress keypress when keydown is canceled).
//
// xterm's _keyDown emits for: any key where evaluateKeyboardEvent returns a
// non-empty result.key AND the event is not uppercase A-Z (which xterm defers
// to keypress for a macOS IME caps-lock fix). evaluateKeyboardEvent requires
// keyCode >= 48 for its default printable-char branch, which excludes space
// (keyCode 32). All special keys (Enter, Tab, Backspace, arrows, F-keys) have
// explicit cases and DO emit from _keyDown.
function xtermWillEmitFromKeydown(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  // Modifier-bearing combos either matched a shortcut (already returned
  // 'consumed') or are routed through xterm's special branches without
  // going through the keypress-double path.
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  // Uppercase A-Z: xterm short-circuits, defers to _keyPress.
  if (event.key.length === 1 && /^[A-Z]$/.test(event.key)) return false;
  // Space: keyCode 32 < 48, evaluateKeyboardEvent returns no key.
  if (event.key === ' ') return false;
  return true;
}

const TerminalPane: React.FC<TerminalPaneProps> = ({
  onWrite,
  onData,
  onResize,
  onTextAreaFocus,
  fontSize = 13,
  cursorBlink = false,
  readonly = false,
  visible = true,
  focused = true,
  className,
  ...rest
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const termRef = React.useRef<Terminal | null>(null);
  const fitAddonRef = React.useRef<FitAddon | null>(null);
  const disposedRef = React.useRef(false);
  // Tracks whether WebGL was lost while hidden and is waiting for a visible
  // transition to recreate. See recreateWebglRef below.
  const webglDeferredRef = React.useRef(false);
  // Called by the visibility useLayoutEffect to recreate the WebGL addon.
  // Hoisted out of the mount effect so the visibility effect can invoke it
  // without re-running mount.
  const recreateWebglRef = React.useRef<(() => void) | null>(null);
  const focusedRef = React.useRef(focused);
  focusedRef.current = focused;

  // Keep refs so handlers always call the latest prop without re-running the effect
  const onDataRef = React.useRef(onData);
  onDataRef.current = onData;
  const onResizeRef = React.useRef(onResize);
  onResizeRef.current = onResize;
  const onTextAreaFocusRef = React.useRef(onTextAreaFocus);
  onTextAreaFocusRef.current = onTextAreaFocus;
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;

  // Re-fit, refocus and refresh when the pane transitions to visible. Without
  // this, switching from a hidden tab leaves xterm's last-known size until the
  // next ResizeObserver tick (~100ms later) — a visible black flash.
  //
  // Three additional jobs handled here, all related to the long-standing
  // "garbled terminal after switching back" bug:
  //
  //   1. clearTextureAtlas() — the WebGL renderer's glyph atlas can be left in
  //      an inconsistent state if any measurement happened against a 0×0
  //      hidden container (cellWidth=0 → Infinity downstream). Wiping the
  //      atlas forces glyphs to be re-rasterized against the now-correct cell
  //      dimensions.
  //
  //   2. WebGL recreation. Recreating the addon on every visible transition
  //      is the most reliable way to eliminate accumulated renderer state
  //      corruption. clearTextureAtlas() only clears glyph caches; the
  //      underlying GL programs and framebuffers are not reset. Full
  //      dispose+recreate matches what Cmd+R does for the renderer while
  //      keeping the xterm buffer (scrollback) intact.
  //
  //      Also handles the deferred case: if onContextLoss fired while
  //      hidden, WebGL creation was blocked (0×0 container → cellWidth=0 →
  //      Infinity in glyph math). The deferred flag lets us reach this
  //      point before attempting creation.
  //
  //   3. Re-focus. When display:none lands on an ancestor, the browser moves
  //      focus to document.body. The `focused` prop hasn't changed, so the
  //      focus useEffect doesn't re-fire on switch-back; the textarea stays
  //      unfocused and keystrokes are dropped until the user clicks. Force
  //      a focus call here whenever we transition to visible.
  React.useLayoutEffect(() => {
    if (!visible) return;
    const fit = fitAddonRef.current;
    const term = termRef.current;
    if (!fit || !term || disposedRef.current) return;
    fit.fit();
    webglDeferredRef.current = false;
    recreateWebglRef.current?.();
    term.refresh(0, term.rows - 1);
    if (!readonly && focusedRef.current) {
      term.focus();
    }
    onResizeRef.current?.(term.cols, term.rows);
  }, [visible, readonly]);

  // When the Electron GPU process crashes and restarts, WebGL contexts are
  // destroyed and canvas 2D may have rendered blank during the crash window.
  // The main process sends this event ~1s after the crash (enough time for
  // Chromium to start a new GPU process). Recreate the WebGL addon and force
  // a full repaint so the terminal content reappears without a manual reload.
  React.useEffect(() => {
    return window.hiveryn.app.onGpuProcessCrashed(() => {
      if (disposedRef.current) return;
      recreateWebglRef.current?.();
      const term = termRef.current;
      if (term) term.refresh(0, term.rows - 1);
    });
  }, []);

  // Drive xterm's DOM focus from the `focused` prop. When another pane has
  // logical keyboard focus, blur xterm so keystrokes don't reach the PTY.
  React.useEffect(() => {
    const term = termRef.current;
    if (!term || disposedRef.current || readonly) return;
    if (focused) {
      term.focus();
    } else {
      term.blur();
    }
  }, [focused, readonly]);

  React.useEffect(() => {
    if (!containerRef.current) return;
    disposedRef.current = false;

    const fontFamily = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-family-mono')
      .trim() || 'monospace';

    const term = new Terminal({
      fontSize,
      fontFamily,
      theme: readTerminalTheme(),
      cursorBlink,
      disableStdin: readonly,
      scrollback: 5000,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new SearchAddon());

    // Unicode 11 width tables — without this, emoji and CJK characters
    // mis-align the cursor by 1 cell.
    try {
      const u11 = new Unicode11Addon();
      term.loadAddon(u11);
      term.unicode.activeVersion = '11';
    } catch {
      // Unicode addon optional; fall through to xterm default tables
    }

    // WebGL renderer eliminates per-row canvas gaps that the default canvas
    // renderer produces at non-integer devicePixelRatios.
    let webglAddon: WebglAddon | null = null;

    const disposeWebgl = (): void => {
      if (webglAddon) {
        try { webglAddon.dispose(); } catch { /* disposal race */ }
        webglAddon = null;
      }
    };

    const attachWebgl = (): void => {
      // Never create a fresh WebGL renderer while the container is hidden.
      // The new WebglRenderer reads cell dimensions from the DOM at construct
      // time; a 0×0 container produces cellWidth=0 / Infinity downstream and
      // permanently corrupts glyph positioning. The visibility useLayoutEffect
      // replays this when we become visible again.
      if (!visibleRef.current) {
        webglDeferredRef.current = true;
        return;
      }
      try {
        const addon = new WebglAddon();
        addon.onContextLoss(() => {
          // On context loss, fall back to the DOM renderer and stop. Do NOT
          // attempt to recreate WebGL here — if the terminal is hidden,
          // recreation would land on a 0×0 container. The visible
          // useLayoutEffect recreates WebGL cleanly on the next tab switch.
          // (Pattern from waveterm: context loss → DOM fallback, recreate
          // on next natural opportunity.)
          disposeWebgl();
          if (!webglDeferredRef.current) {
            term.refresh(0, term.rows - 1);
          }
        });
        term.loadAddon(addon);
        webglAddon = addon;
      } catch {
        // WebGL unavailable — canvas renderer is the fallback
      }
    };

    // Exposed so the visibility useLayoutEffect can fully recreate the WebGL
    // addon on each visible transition. This matches what Cmd+R does for the
    // renderer (fresh GL context, fresh texture atlas) while preserving the
    // xterm.js buffer state and scrollback.
    recreateWebglRef.current = (): void => {
      disposeWebgl();
      attachWebgl();
    };

    attachWebgl();

    term.open(containerRef.current);

    // xterm calls this BEFORE its own _keyDown / _keyPress / _inputEvent.
    // Returning false short-circuits xterm's processing for that event.
    //
    // Three jobs:
    //   1. Route app shortcuts through the dispatcher and consume matches.
    //   2. Translate Shift+Enter to LF so agent TUIs (Claude, Cursor) treat
    //      it as a newline-within-input rather than xterm's default CR.
    //   3. Suppress xterm's _keyPress when its _keyDown already emitted —
    //      otherwise printable chars and Enter are sent twice (Chromium does
    //      not suppress keypress when keydown is preventDefaulted).
    let suppressNextKeypress = false;
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown') {
        if (
          event.key === 'Enter' &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          onDataRef.current?.('\n');
          suppressNextKeypress = true;
          return false;
        }

        if (dispatch(event) === 'consumed') {
          suppressNextKeypress = false;
          return false;
        }

        suppressNextKeypress = xtermWillEmitFromKeydown(event);
        return true;
      }

      if (event.type === 'keypress') {
        if (suppressNextKeypress) {
          suppressNextKeypress = false;
          return false;
        }
        return true;
      }

      return true;
    });

    // Update app focus state whenever the textarea gains DOM focus (covers
    // both programmatic term.focus() and user mouse clicks). This keeps
    // focusedPane in lock-step with reality.
    const textarea = term.textarea;
    const focusListener = (): void => {
      onTextAreaFocusRef.current?.();
    };
    textarea?.addEventListener('focus', focusListener);

    // Only fit/focus on initial mount if visible. If we're mounted into a
    // hidden tab (e.g., inactive session on app startup), fit() against a 0×0
    // container would resize xterm to zero cells and poison the WebGL cell
    // dimensions. The visibility useLayoutEffect runs fit+focus when the tab
    // first becomes visible.
    if (visibleRef.current) {
      fitAddon.fit();
      // Fire initial resize immediately so callers can size the PTY before connecting
      onResizeRef.current?.(term.cols, term.rows);
      // Focus so keystrokes are captured without requiring a manual click
      if (!readonly && focused) {
        term.focus();
      }
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    if (onWrite) {
      onWrite(term.write.bind(term));
    }

    let dataDispose: { dispose: () => void } | null = null;
    if (!readonly) {
      dataDispose = term.onData(data => onDataRef.current?.(data));
    }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        if (disposedRef.current) return;
        if (!visibleRef.current) return;
        fitAddon.fit();
        onResizeRef.current?.(term.cols, term.rows);
      }, 100);
    });
    observer.observe(containerRef.current);

    // Theme reactivity: when the .dark class flips on <html>, re-read tokens
    // and push a new theme into the live terminal. xterm picks it up
    // synchronously, no remount needed.
    const themeObserver = new MutationObserver(() => {
      if (disposedRef.current) return;
      term.options.theme = readTerminalTheme();
      term.refresh(0, term.rows - 1);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      disposedRef.current = true;
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      dataDispose?.dispose();
      textarea?.removeEventListener('focus', focusListener);
      observer.disconnect();
      themeObserver.disconnect();
      // Detach xterm's DOM element before React tears down the container.
      // Without this, removing the container node fires a scroll event that hits
      // xterm's still-live scroll listener → crash.
      const xtermEl = term.element;
      if (xtermEl?.parentNode) xtermEl.parentNode.removeChild(xtermEl);
      termRef.current = null;
      fitAddonRef.current = null;
      recreateWebglRef.current = null;
      webglDeferredRef.current = false;
      // Viewport constructor schedules `setTimeout(() => syncScrollArea())` that
      // xterm never cancels in dispose(). In React StrictMode, cleanup runs
      // synchronously before that callback fires. Deferring disposal lets the
      // callback complete while the renderer is still alive, preventing an
      // uncaught crash on `_renderer.value!.dimensions`.
      setTimeout(() => {
        try { term.dispose(); } catch { /* disposal-order race, safe to ignore */ }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} {...rest}>
      <div ref={containerRef} className={styles.terminal} />
    </div>
  );
};

export default TerminalPane;
