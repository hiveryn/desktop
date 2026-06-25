import type { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import * as React from 'react';
import '@xterm/xterm/css/xterm.css';
import { isShiftEnter, xtermWillEmitFromKeydown } from './keymap';
import { OverlayFitAddon } from './overlayFit';
import styles from './TerminalView.module.css';
import type { GpuCrashSource, RouteKey, TerminalThemeSource } from './types';

export interface TerminalViewProps extends React.HTMLAttributes<HTMLDivElement> {
  // Consumer receives a write function to push data into the terminal. Accepts
  // string or Uint8Array — the latter is the right type for raw PTY bytes that
  // may include partial UTF-8 sequences at chunk boundaries.
  onWrite?: (writeFn: (data: string | Uint8Array) => void) => void;
  // Fires when the user types — wire to a transport or a PTY.
  onData?: (data: string) => void;
  // Fires when the terminal resizes — send cols/rows to the PTY/daemon.
  onResize?: (cols: number, rows: number) => void;
  // Theme + font, injected so the module never reads CSS variables directly.
  themeSource: TerminalThemeSource;
  // App-shortcut router. Returns 'consumed' to suppress xterm's processing.
  routeKey: RouteKey;
  // Subscribe to host GPU-process crashes (WebGL contexts destroyed). Returns
  // an unsubscribe.
  gpuCrash: GpuCrashSource;
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
  // Fires when the xterm helper textarea receives DOM focus. The host listens
  // for this so a mouse click on the terminal updates the focused pane in the
  // session store (single source of truth for focus).
  onTextAreaFocus?: () => void;
}

const TerminalView: React.FC<TerminalViewProps> = ({
  onWrite,
  onData,
  onResize,
  onTextAreaFocus,
  themeSource,
  routeKey,
  gpuCrash,
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
  // Injected deps read inside the mount effect's handlers — keep them in refs so
  // the once-only effect always sees the latest without re-running.
  const themeSourceRef = React.useRef(themeSource);
  themeSourceRef.current = themeSource;
  const routeKeyRef = React.useRef(routeKey);
  routeKeyRef.current = routeKey;
  const gpuCrashRef = React.useRef(gpuCrash);
  gpuCrashRef.current = gpuCrash;

  // Restore focus when the pane transitions to visible. The renderer needs no
  // help here: panes are hidden with visibility:hidden in a stable layout slot
  // (see ExtraTerminalStack / SessionTerminal), so the terminal stays laid out
  // at its real size the whole time. xterm therefore never sees a 0×0 container
  // or a display:none subtree — its internal IntersectionObserver never pauses
  // the renderer, and our ResizeObserver keeps the grid fitted to the slot even
  // while hidden. Nothing is stale on switch-back, so no fit/refresh is needed.
  //
  // Focus is the one thing the browser drops: hiding an element (or a
  // display:none ancestor, still used for the split secondary and background
  // sessions) moves focus to document.body. The `focused` prop may not change
  // on switch-back, so the focus useEffect below won't re-fire — restore focus
  // here whenever we become visible.
  React.useLayoutEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    if (!term || disposedRef.current) return;
    if (!readonly && focusedRef.current) {
      term.focus();
    }
  }, [visible, readonly]);

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

  // Mount-once: xterm is constructed a single time and its handlers read the
  // latest props via refs. The construction options (fontSize/cursorBlink/etc.)
  // are intentionally captured at mount — re-running would destroy and recreate
  // the terminal. Matches the pre-extraction TerminalPane behavior.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once terminal construction; props captured intentionally
  React.useEffect(() => {
    if (!containerRef.current) return;
    disposedRef.current = false;

    const fontFamily = themeSourceRef.current.readFontFamily();

    const term = new Terminal({
      fontSize,
      fontFamily,
      theme: themeSourceRef.current.readTheme(),
      cursorBlink,
      disableStdin: readonly,
      scrollback: 5000,
      allowTransparency: false,
    });

    const fitAddon = new OverlayFitAddon();
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

    // WebGL renderer — crisp glyphs with no per-row seams at fractional
    // devicePixelRatios (the DOM renderer leaves visible gaps in box-drawing
    // borders, which is why WebGL is used here).
    //
    // The WebGL lifecycle is driven by the layout BOX, not the `visible` prop:
    //
    //   - A pane is hidden by visibility:hidden in a STABLE layout slot (see
    //     ExtraTerminalStack), so it keeps a real box the whole time. Its box
    //     never changes on tab switch, so its WebGL context is never disposed or
    //     recreated — the renderer just keeps drawing. This is the fix for the
    //     black/garbled-on-tab-switch bug: recreating the GL context on every
    //     switch raced Chromium's async context GC and resumed against stale
    //     geometry.
    //
    //   - A pane that is genuinely removed from layout (display:none — used for
    //     background SESSIONS and the split secondary) collapses to a 0×0 box.
    //     We dispose its context then (freeing it back under Chromium's ~16
    //     live-context cap; exceeding it force-loses the oldest → black main
    //     pane) and re-attach when the box reappears. Attaching on box-appear
    //     (driven by the ResizeObserver, after layout) means the new
    //     WebglRenderer always reads a valid cell size — no 0×0 poisoning.
    let webglAddon: WebglAddon | null = null;

    const disposeWebgl = (): void => {
      if (webglAddon) {
        try {
          webglAddon.dispose();
        } catch {
          /* disposal race */
        }
        webglAddon = null;
      }
    };

    const attachWebgl = (): void => {
      // Already attached, or no box yet (would construct against a 0×0 container
      // and poison glyph cell math). The ResizeObserver re-runs this the moment
      // a real box appears.
      if (webglAddon || disposedRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      try {
        const addon = new WebglAddon();
        addon.onContextLoss(() => {
          // Context lost (e.g. GPU process restart). Drop to the DOM renderer;
          // the next ResizeObserver fit or the GPU-crash handler re-attaches.
          disposeWebgl();
          if (!disposedRef.current) term.refresh(0, term.rows - 1);
        });
        term.loadAddon(addon);
        webglAddon = addon;
      } catch {
        // WebGL unavailable — xterm's DOM renderer is the fallback.
      }
    };

    term.open(containerRef.current);

    // When the host GPU process crashes and restarts, every WebGL context is
    // destroyed. Re-attach and force a repaint so terminals recover without a
    // manual reload. (display:none panes have no box → attachWebgl is a no-op
    // until they're shown again.)
    const offGpuCrash = gpuCrashRef.current(() => {
      if (disposedRef.current) return;
      disposeWebgl();
      attachWebgl();
      term.refresh(0, term.rows - 1);
    });

    // xterm calls this BEFORE its own _keyDown / _keyPress / _inputEvent.
    // Returning false short-circuits xterm's processing for that event.
    //
    // Three jobs:
    //   1. Translate Shift+Enter to LF so agent TUIs (Claude, Cursor) treat
    //      it as a newline-within-input rather than xterm's default CR.
    //   2. Route app shortcuts through the injected router and consume matches.
    //   3. Suppress xterm's _keyPress when its _keyDown already emitted —
    //      otherwise printable chars and Enter are sent twice (Chromium does
    //      not suppress keypress when keydown is preventDefaulted).
    let suppressNextKeypress = false;
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown') {
        if (isShiftEnter(event)) {
          onDataRef.current?.('\n');
          suppressNextKeypress = true;
          return false;
        }

        if (routeKeyRef.current(event) === 'consumed') {
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
    // both programmatic term.focus() and user mouse clicks). This keeps the
    // host's focused-pane state in lock-step with reality.
    const textarea = term.textarea;
    const focusListener = (): void => {
      onTextAreaFocusRef.current?.();
    };
    textarea?.addEventListener('focus', focusListener);

    // Hide the overlay scrollbar entirely while the alternate screen buffer is
    // active. Full-screen TUIs (vim, opencode, etc.) switch to the alt buffer,
    // which has no scrollback — xterm would otherwise flash the scrollbar on
    // their frequent redraws even though there is nothing to scroll and the TUI
    // draws its own. A class the CSS keys off (see TerminalView.module.css)
    // tracks the active buffer type.
    const altBufferContainer = containerRef.current;
    const syncAltBuffer = (): void => {
      altBufferContainer.classList.toggle(
        styles.altBuffer,
        term.buffer.active.type === 'alternate',
      );
    };
    syncAltBuffer();
    const bufferDispose = term.buffer.onBufferChange(syncAltBuffer);

    // Fit on initial mount whenever the container has a real box. A pane mounted
    // into a stable layout slot (visibility:hidden) is laid out at full size, so
    // it can — and should — fit immediately, sizing its PTY before the first
    // connect. A pane mounted under a display:none ancestor (split secondary,
    // background session) has a 0×0 box; skip it and let the ResizeObserver fit
    // once the box appears. fit() on a 0×0 box is a no-op anyway (proposeDimensions
    // bails on a zero cell), but checking is clearer.
    const initialRect = containerRef.current.getBoundingClientRect();
    if (initialRect.width > 0 && initialRect.height > 0) {
      fitAddon.fit();
      // Box is present — safe to attach the WebGL renderer (reads a valid cell size).
      attachWebgl();
      // Fire initial resize immediately so callers can size the PTY before connecting
      onResizeRef.current?.(term.cols, term.rows);
      // Focus so keystrokes are captured without requiring a manual click
      if (!readonly && focused && visibleRef.current) {
        term.focus();
      }
    }

    // Re-measure and re-fit once webfonts finish loading. xterm measures cell
    // width at open(); if Geist Mono hasn't loaded yet, the measurement uses
    // the (wider) fallback font, so cols comes out low and the terminal only
    // occupies ~95% of the pane forever — the ResizeObserver never fires
    // because the container itself didn't change size. Toggling fontFamily
    // forces xterm's CharSizeService to re-measure against the real font.
    void document.fonts.ready.then(() => {
      if (disposedRef.current) return;
      const families = term.options.fontFamily;
      term.options.fontFamily = 'monospace';
      term.options.fontFamily = families;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        fitAddon.fit();
        term.refresh(0, term.rows - 1);
        onResizeRef.current?.(term.cols, term.rows);
      }
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    if (onWrite) {
      onWrite(term.write.bind(term));
    }

    let dataDispose: { dispose: () => void } | null = null;
    if (!readonly) {
      dataDispose = term.onData((data) => onDataRef.current?.(data));
    }

    // Fit SYNCHRONOUSLY on every size change, but debounce only the daemon
    // resize notification.
    //
    // xterm renders its screen at exactly rows×cellHeight pixels. So any frame
    // where xterm holds a stale, larger row count than the container now fits
    // renders the bottom rows below the fold, where `.root`'s overflow:hidden
    // silently clips them — content vanishes.
    //
    // The previous resize ticket debounced this whole callback 100ms to avoid
    // flooding the PTY with SIGWINCH. That also delayed fit() itself, leaving
    // exactly that stale-grid clip window open during (and 100ms after) every
    // resize. ResizeObserver fires after layout but before paint, so fitting
    // here keeps xterm's grid matched to the container pixel dimensions every
    // frame, with no overflow flash. Only onResize (the WS message the prior
    // ticket actually wanted to throttle) stays debounced. fit() resizing the
    // xterm canvas does not change the observed container box, so there is no
    // observer feedback loop.
    //
    // Gate on the observed box size, NOT on the `visible` prop. A backgrounded
    // pane in a stable layout slot is visibility:hidden but fully laid out, so
    // it must keep fitting as the slot resizes (window resize, split toggle) —
    // otherwise its grid would go stale exactly while hidden and corrupt on
    // switch-back (the bug this fixes). A pane under a display:none ancestor
    // reports a 0×0 box; skip it (fitting 0×0 would resize xterm to nothing),
    // and the observer fires again with a real box the moment it's shown.
    //
    // The box transition also drives the WebGL lifecycle: dispose the context
    // when the box vanishes (display:none → free it under Chromium's context
    // cap) and re-attach when a real box reappears (display:none → shown). A
    // visibility:hidden pane keeps the same box, so this never fires on an
    // in-place show/hide — its context simply persists, no churn.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      if (disposedRef.current) return;
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) {
        disposeWebgl();
        return;
      }
      attachWebgl();
      const prevCols = term.cols;
      const prevRows = term.rows;
      fitAddon.fit();
      // fit() → term.resize() reflows the FULL scrollback (Buffer.resize), but the
      // renderer only repaints the live viewport. When scrolled up into scrollback,
      // the displayed rows keep their pre-resize wrapping until something marks them
      // dirty — so maximizing while scrolled up leaves stale/garbled rows on screen
      // until the next scroll. Force the repaint here. Gated on scrolled-up
      // (viewportY < baseY) so the common bottom-anchored case and drag-resizes pay
      // no extra full refresh — the renderer already paints the bottom correctly.
      const buf = term.buffer.active;
      if ((term.cols !== prevCols || term.rows !== prevRows) && buf.viewportY < buf.baseY) {
        term.refresh(0, term.rows - 1);
      }
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        if (disposedRef.current) return;
        onResizeRef.current?.(term.cols, term.rows);
      }, 100);
    });
    observer.observe(containerRef.current);

    return () => {
      disposedRef.current = true;
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      offGpuCrash();
      disposeWebgl();
      bufferDispose.dispose();
      dataDispose?.dispose();
      textarea?.removeEventListener('focus', focusListener);
      observer.disconnect();
      // Detach xterm's DOM element before React tears down the container.
      // Without this, removing the container node fires a scroll event that hits
      // xterm's still-live scroll listener → crash.
      const xtermEl = term.element;
      if (xtermEl?.parentNode) xtermEl.parentNode.removeChild(xtermEl);
      termRef.current = null;
      fitAddonRef.current = null;
      term.dispose();
    };
  }, []);

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} {...rest}>
      <div ref={containerRef} className={styles.terminal} />
    </div>
  );
};

export default TerminalView;
