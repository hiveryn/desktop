import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';

export const XTERM_THEME = {
  background: '#000000',
  foreground: '#c8c8d8',
  cursor: '#a0a0f8',
  cursorAccent: '#000000',
  selectionBackground: '#a0a0f840',
  black: '#1a1a2e', red: '#ff5566', green: '#50fa7b', yellow: '#f1fa8c',
  blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#d0d0e0',
  brightBlack: '#4a4a6a', brightRed: '#ff7777', brightGreen: '#69ff94',
  brightYellow: '#ffffa5', brightBlue: '#9fbaff', brightMagenta: '#d6b3f5',
  brightCyan: '#a4ffff', brightWhite: '#ffffff',
};

interface MockTerminalProps {
  lines: string[];
}

export function MockTerminal({ lines }: MockTerminalProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      theme: XTERM_THEME,
      fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: true,
      convertEol: true,
      scrollback: 500,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    let cancelled = false;
    (async () => {
      for (const line of lines) {
        if (cancelled) break;
        await new Promise<void>((r) => setTimeout(r, 40 + Math.random() * 60));
        term.writeln(line);
      }
    })();

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      term.dispose();
    };
  }, [lines]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
