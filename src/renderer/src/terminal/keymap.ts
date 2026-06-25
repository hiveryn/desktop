// Pure keyboard mechanics for the xterm view. These are terminal input-encoding
// rules (not app shortcuts), so they live inside the module and need no
// injection.

// Shift+Enter (with no other modifier) means "newline within input" for agent
// TUIs (Claude, Cursor) rather than xterm's default CR. Detected here so the
// view can translate it to LF before app-shortcut routing or xterm's default.
export function isShiftEnter(event: KeyboardEvent): boolean {
  return (
    event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
  );
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
export function xtermWillEmitFromKeydown(event: KeyboardEvent): boolean {
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
