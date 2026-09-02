// Default keybindings for the panes whose config sections are optional in the
// daemon response (`files` / `git-diff` — the daemon repo may not ship them
// yet). Single source of truth shared by the pane key handlers and the
// shortcuts help dialog, so the two can never drift. Required sections
// (global/kanban/event-log) have no desktop defaults by design — see
// useShortcutConfig.

export const FILES_BINDING_DEFAULTS: Record<string, string> = {
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
  'search-content': 'shift+/',
  'toggle-sidebar': 'b',
  edit: 'i',
  save: 'cmd+s',
  'copy-path': 'y',
  create: 'a',
};

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

export const ROADMAP_BINDING_DEFAULTS: Record<string, string> = {
  down: 'j',
  up: 'k',
  right: 'l',
  left: 'h',
  open: 'o',
  refresh: 'r',
  top: 'g g',
  bottom: 'shift+g',
  'jump-down': 'shift+]',
  'jump-up': 'shift+[',
  'toggle-archive': 'a',
};

/** Daemon-configured bindings layered over the pane defaults. */
export function resolveBindings(
  section: Record<string, string> | undefined,
  defaults: Record<string, string>,
): Record<string, string> {
  return { ...defaults, ...(section ?? {}) };
}
