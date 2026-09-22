import type { SessionTab } from '@hiveryn/shared/domain';

// Terminals and browser tabs are the multi-instance tab types and are keyed by
// their unique daemon-assigned id. Every other tab type — builtin
// (kanban/event-log/ticket) or plugin (git-diff/files) — is single-instance and
// keyed by its type.
export function tabIdOf(tab: SessionTab): string {
  if (tab.type === 'terminal' || tab.type === 'browser') {
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
// Terminal and browser tab ids are both uuids, so the tab list is needed to
// resolve the type behind the id.
export function focusIdForTab(tabId: string, tabs: SessionTab[]): string {
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
  const tab = tabs.find((candidate) => tabIdOf(candidate) === tabId);
  if (tab?.type === 'browser') {
    return `right-browser:${tabId}`;
  }
  return `right-terminal:${tabId}`;
}
