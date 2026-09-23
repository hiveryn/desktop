import type { SessionTab } from '@hiveryn/shared/domain';

// Terminals are the only multi-instance tab type and are keyed by their unique
// daemon-assigned id. Every other tab type — builtin
// (kanban/event-log/ticket) or plugin (git-diff/files) — is single-instance and
// keyed by its type.
export function tabIdOf(tab: SessionTab): string {
  if (tab.type === 'terminal') {
    if (!tab.id) {
      throw new Error(`${tab.type} tab is missing id: ${JSON.stringify(tab)}`);
    }
    return tab.id;
  }
  return tab.type;
}

// Maps a right-pane tab id to its `focusedPane` string. This is the single
// source of truth — previously three hand-maintained copies (store, RightPane,
// dispatcher) had drifted (the store copy was missing the `git-diff` case).
// Any other id is a terminal uuid.
export function focusIdForTab(tabId: string): string {
  switch (tabId) {
    case 'kanban':
      return 'right-kanban';
    case 'event-log':
      return 'right-event-log';
    case 'ticket':
      return 'right-ticket';
    case 'git-diff':
      return 'right-git-diff';
    case 'files':
      return 'right-files';
  }
  return `right-terminal:${tabId}`;
}
