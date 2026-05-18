import { useEffect, useState } from 'react';

export type ShortcutConfig = Record<string, Record<string, string>>;

const REQUIRED_SECTIONS = ['global', 'kanban', 'event-log'] as const;

// Maps unshifted key characters to their shifted equivalents on a US layout,
// so that a binding like "Cmd+Shift+[" correctly matches event.key === "{".
const SHIFT_MAP: Record<string, string> = {
  '[': '{',
  ']': '}',
  '\\': '|',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
  '`': '~',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
};

// Layout-independent physical key codes for punctuation/digit keys. Some
// platforms (notably macOS with Cmd+Shift held) report event.key as the
// shifted variant (e.g. "0" → ")"), so we also accept a match by event.code.
const CODE_MAP: Record<string, string> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  '0': 'Digit0',
  '1': 'Digit1',
  '2': 'Digit2',
  '3': 'Digit3',
  '4': 'Digit4',
  '5': 'Digit5',
  '6': 'Digit6',
  '7': 'Digit7',
  '8': 'Digit8',
  '9': 'Digit9',
};

/** Returns true when a text-input element currently owns focus. Use this to
 *  bail out of capture-phase shortcut handlers so they don't swallow keystrokes
 *  that belong to an active input (e.g. the profile-selector filter).
 *  Excludes xterm.js's hidden helper textarea so terminal focus does not block
 *  navigation shortcuts. */
export function isInputFocused(): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement && active.classList.contains('xterm-helper-textarea')) {
    return false;
  }
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

export function matchesShortcut(event: KeyboardEvent, binding: string): boolean {
  if (event.repeat) return false;
  if (!binding) return false;
  const parts = binding.toLowerCase().split('+');
  const rawKey = parts[parts.length - 1];
  const meta = parts.includes('cmd') || parts.includes('meta');
  const shift = parts.includes('shift');
  const alt = parts.includes('alt') || parts.includes('option');
  const ctrl = parts.includes('ctrl') || parts.includes('control');

  if (
    event.metaKey !== meta ||
    event.shiftKey !== shift ||
    event.altKey !== alt ||
    event.ctrlKey !== ctrl
  ) {
    return false;
  }

  // Match by physical key code for punctuation — most reliable across
  // platforms when modifiers are held.
  const codeForKey = CODE_MAP[rawKey];
  if (codeForKey && event.code === codeForKey) return true;

  // Otherwise match by event.key. With shift held, the produced character is
  // typically the shifted variant (e.g. "[" → "{"), but some platforms report
  // the raw key with shift held — accept both.
  const eventKeyLower = event.key.toLowerCase();
  const shiftedKey = SHIFT_MAP[rawKey];
  if (shift && shiftedKey && eventKeyLower === shiftedKey) return true;
  return eventKeyLower === rawKey;
}

export function useShortcutConfig(): ShortcutConfig | null {
  const [config, setConfig] = useState<ShortcutConfig | null>(null);

  useEffect(() => {
    function load(): void {
      window.hiveryn.config
        .getShortcuts()
        .then((raw) => {
          for (const section of REQUIRED_SECTIONS) {
            if (!raw?.[section]) {
              console.error(
                `[shortcuts] daemon returned incomplete config (missing section: "${section}") — keyboard shortcuts disabled`,
              );
              return;
            }
          }
          setConfig(raw);
        })
        .catch((err: unknown) => {
          console.error('[shortcuts] failed to load shortcuts config:', err);
        });
    }

    load();
    // Refetch when the window regains focus so daemon-side edits to
    // ~/.hiveryn/shortcuts.yaml flow in without a manual reload.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  return config;
}
