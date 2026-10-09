import { create } from 'zustand';

// Window-lifetime layout preferences for the right-pane tabs. Collapsing the
// git-diff file list is a user choice that should survive session switches and
// pane remounts (RightPane's ErrorBoundary resetKeys remount panes on session
// change), so it can't live in component state. Deliberately not persisted to
// disk — losing it on app restart is fine.

interface PaneLayoutState {
  gitDiffSidebarCollapsed: boolean;
}

interface PaneLayoutActions {
  toggleGitDiffSidebar(): void;
}

export const usePaneLayoutStore = create<PaneLayoutState & PaneLayoutActions>((set) => ({
  gitDiffSidebarCollapsed: false,
  toggleGitDiffSidebar() {
    set((state) => ({ gitDiffSidebarCollapsed: !state.gitDiffSidebarCollapsed }));
  },
}));
