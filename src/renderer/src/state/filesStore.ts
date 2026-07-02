import { create } from 'zustand';

// View state for the native files tab. The pane is a single mounted instance
// shared across sessions (RightPane keeps panels mounted, hidden via
// data-active), so per-session explorer state lives here keyed by sessionId.
// The daemon owns no part of this — it's pure UI navigation state.

export interface CustomRoot {
  path: string;
  label: string;
}

export interface FilesSessionState {
  rootId: string;
  rootPath: string;
  currentDir: string;
  openFilePath: string | null;
  expandedDirs: string[];
}

interface FilesState {
  // Custom picker roots live for the window's lifetime and are shared across
  // sessions; they are not persisted.
  customRoots: CustomRoot[];
  bySession: Record<string, FilesSessionState>;
}

interface FilesActions {
  addCustomRoot(path: string): void;
  setRoot(sessionId: string, rootId: string, rootPath: string): void;
  setCurrentDir(sessionId: string, dir: string): void;
  setOpenFile(sessionId: string, path: string | null): void;
  toggleExpanded(sessionId: string, dir: string): void;
}

type FilesStore = FilesState & FilesActions;

function sessionState(state: FilesState, sessionId: string): FilesSessionState | undefined {
  return state.bySession[sessionId];
}

function requireSessionState(state: FilesState, sessionId: string): FilesSessionState {
  const existing = sessionState(state, sessionId);
  if (!existing) {
    throw new Error(`files state for session ${sessionId} not initialized — call setRoot first`);
  }
  return existing;
}

export const useFilesStore = create<FilesStore>((set) => ({
  customRoots: [],
  bySession: {},
  addCustomRoot(path) {
    set((state) => {
      if (state.customRoots.some((root) => root.path === path)) return state;
      const label = path.split('/').filter(Boolean).pop() ?? path;
      return { customRoots: [...state.customRoots, { path, label }] };
    });
  },
  setRoot(sessionId, rootId, rootPath) {
    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: {
          rootId,
          rootPath,
          currentDir: rootPath,
          openFilePath: null,
          expandedDirs: [],
        },
      },
    }));
  },
  setCurrentDir(sessionId, dir) {
    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: { ...requireSessionState(state, sessionId), currentDir: dir },
      },
    }));
  },
  setOpenFile(sessionId, path) {
    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: { ...requireSessionState(state, sessionId), openFilePath: path },
      },
    }));
  },
  toggleExpanded(sessionId, dir) {
    set((state) => {
      const existing = requireSessionState(state, sessionId);
      const expanded = existing.expandedDirs.includes(dir)
        ? existing.expandedDirs.filter((d) => d !== dir)
        : [...existing.expandedDirs, dir];
      return {
        bySession: {
          ...state.bySession,
          [sessionId]: { ...existing, expandedDirs: expanded },
        },
      };
    });
  },
}));
