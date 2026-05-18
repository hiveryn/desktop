// Single source of truth for shortcut-binding string → KeyboardEvent matching.
// Shared by the dispatcher and any dynamic handler that wants to compare an
// event against a `"Cmd+Shift+H"`-style binding from the daemon config.

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

  const codeForKey = CODE_MAP[rawKey];
  if (codeForKey && event.code === codeForKey) return true;

  const eventKeyLower = event.key.toLowerCase();
  const shiftedKey = SHIFT_MAP[rawKey];
  if (shift && shiftedKey && eventKeyLower === shiftedKey) return true;
  return eventKeyLower === rawKey;
}

// Returns true when a text-input element currently owns focus. Pane-local
// handlers use this to bail out so the user can type into search inputs etc.
// Note: deliberately includes xterm's helper textarea — terminal-bound keys
// are routed through xterm's customKeyEventHandler, not this matcher, so the
// document-level dispatcher should never see them in the first place.
export function isTextInputFocused(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}
