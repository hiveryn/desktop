import { create } from 'zustand';

// Window-lifetime layout preferences for the right-pane tabs. Collapsing a
// pane's sidebar is a user choice that should survive session switches and
// pane remounts (RightPane's ErrorBoundary resetKeys remount panes on session
// change), so it can't live in component state. Deliberately not persisted to
// disk — losing it on app restart is fine.

interface PaneLayoutState {
  gitDiffSidebarCollapsed: boolean;
  filesSidebarCollapsed: boolean;
  // Soft-wrap long lines in the files-tab editor. One knob for all files —
  // wrap preference is about reading habit, not per-file state.
  editorWordWrap: boolean;
}

interface PaneLayoutActions {
  toggleGitDiffSidebar(): void;
  toggleFilesSidebar(): void;
  toggleEditorWordWrap(): void;
}

export const usePaneLayoutStore = create<PaneLayoutState & PaneLayoutActions>((set) => ({
  gitDiffSidebarCollapsed: false,
  filesSidebarCollapsed: false,
  editorWordWrap: false,
  toggleGitDiffSidebar() {
    set((state) => ({ gitDiffSidebarCollapsed: !state.gitDiffSidebarCollapsed }));
  },
  toggleFilesSidebar() {
    set((state) => ({ filesSidebarCollapsed: !state.filesSidebarCollapsed }));
  },
  toggleEditorWordWrap() {
    set((state) => ({ editorWordWrap: !state.editorWordWrap }));
  },
}));
