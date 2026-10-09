// Default keybindings for the git-diff pane, whose config section is optional
// in the daemon response. Single source of truth shared by the pane key
// handler and the shortcuts help dialog, so the two can never drift. Required sections
// (global/kanban/event-log) have no desktop defaults by design — see
// useShortcutConfig.

export const GIT_DIFF_BINDING_DEFAULTS: Record<string, string> = {
  down: 'j',
  up: 'k',
  right: 'l',
  left: 'h',
  open: 'o',
  'scroll-down': 'shift+j',
  'scroll-up': 'shift+k',
  refresh: 'r',
  top: 'g g',
  bottom: 'shift+g',
  'jump-down': 'shift+]',
  'jump-up': 'shift+[',
  search: '/',
  'toggle-sidebar': 'b',
};

/** Daemon-configured bindings layered over the pane defaults. */
export function resolveBindings(
  section: Record<string, string> | undefined,
  defaults: Record<string, string>,
): Record<string, string> {
  return { ...defaults, ...(section ?? {}) };
}
