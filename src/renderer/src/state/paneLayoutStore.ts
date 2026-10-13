import { create } from 'zustand';

// Window-lifetime layout preferences for the right-pane tabs. Collapsing the
// git-diff file list is a user choice that should survive session switches and
// pane remounts (RightPane's ErrorBoundary resetKeys remount panes on session
// change), so it can't live in component state. Line wrapping in the diff is
// the same kind of choice and defaults to on. Deliberately not persisted to
// disk — losing it on app restart is fine.

interface PaneLayoutState {
  gitDiffSidebarCollapsed: boolean;
  gitDiffWrapLines: boolean;
}

interface PaneLayoutActions {
  toggleGitDiffSidebar(): void;
  toggleGitDiffWrapLines(): void;
}

export const usePaneLayoutStore = create<PaneLayoutState & PaneLayoutActions>((set) => ({
  gitDiffSidebarCollapsed: false,
  gitDiffWrapLines: true,
  toggleGitDiffSidebar() {
    set((state) => ({ gitDiffSidebarCollapsed: !state.gitDiffSidebarCollapsed }));
  },
  toggleGitDiffWrapLines() {
    set((state) => ({ gitDiffWrapLines: !state.gitDiffWrapLines }));
  },
}));
