import * as React from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import styles from './TerminalPane.module.css';

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

const TerminalPane: React.FC<TerminalPaneProps> = ({
  onWrite,
  onData,
  onResize,
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

  // Keep refs so handlers always call the latest prop without re-running the effect
  const onDataRef = React.useRef(onData);
  onDataRef.current = onData;
  const onResizeRef = React.useRef(onResize);
  onResizeRef.current = onResize;

  // Re-fit and refresh synchronously when the pane transitions to visible.
  // Without this, switching from a hidden tab leaves xterm's last-known size
  // until the next ResizeObserver tick (~100ms later) — a visible black flash.
  React.useLayoutEffect(() => {
    if (!visible) return;
    const fit = fitAddonRef.current;
    const term = termRef.current;
    if (!fit || !term || disposedRef.current) return;
    fit.fit();
    term.refresh(0, term.rows - 1);
    onResizeRef.current?.(term.cols, term.rows);
  }, [visible]);

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
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        try { webglAddon?.dispose(); } catch { /* context-loss disposal race, safe to ignore */ }
        webglAddon = null;
        term.refresh(0, term.rows - 1);
      });
      term.loadAddon(webglAddon);
    } catch {
      // WebGL unavailable — fall back to built-in canvas renderer silently
    }

    term.open(containerRef.current);

    fitAddon.fit();
    // Fire initial resize immediately so callers can size the PTY before connecting
    onResizeRef.current?.(term.cols, term.rows);
    // Focus so keystrokes are captured without requiring a manual click
    if (!readonly && focused) {
      term.focus();
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
      observer.disconnect();
      themeObserver.disconnect();
      // Detach xterm's DOM element before React tears down the container.
      // Without this, removing the container node fires a scroll event that hits
      // xterm's still-live scroll listener → crash.
      const xtermEl = term.element;
      if (xtermEl?.parentNode) xtermEl.parentNode.removeChild(xtermEl);
      termRef.current = null;
      fitAddonRef.current = null;
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
