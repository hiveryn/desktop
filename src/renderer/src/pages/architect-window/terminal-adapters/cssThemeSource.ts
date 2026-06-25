import type { ITheme } from '@xterm/xterm';
import type { TerminalThemeSource } from '../../../terminal';

// Reads xterm's palette and font from the global design-system CSS variables so
// the terminal tracks the app theme. Read live on every call (no caching) so a
// theme switch is reflected the next time the view re-reads (construction and
// document.fonts.ready).
export const cssThemeSource: TerminalThemeSource = {
  readTheme(): ITheme {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    return {
      foreground: v('--theme-text'),
      background: v('--theme-background'),
      cursor: v('--theme-cursor'),
      cursorAccent: v('--theme-cursor-accent'),
      selectionBackground: v('--theme-terminal-selection'),
      black: v('--theme-ansi-black'),
      red: v('--theme-ansi-red'),
      green: v('--theme-ansi-green'),
      yellow: v('--theme-ansi-yellow'),
      blue: v('--theme-ansi-blue'),
      magenta: v('--theme-ansi-magenta'),
      cyan: v('--theme-ansi-cyan'),
      white: v('--theme-ansi-white'),
      brightBlack: v('--theme-ansi-bright-black'),
      brightRed: v('--theme-ansi-bright-red'),
      brightGreen: v('--theme-ansi-bright-green'),
      brightYellow: v('--theme-ansi-bright-yellow'),
      brightBlue: v('--theme-ansi-bright-blue'),
      brightMagenta: v('--theme-ansi-bright-magenta'),
      brightCyan: v('--theme-ansi-bright-cyan'),
      brightWhite: v('--theme-ansi-bright-white'),
    };
  },
  readFontFamily(): string {
    return (
      getComputedStyle(document.documentElement).getPropertyValue('--font-family-mono').trim() ||
      'monospace'
    );
  },
};
