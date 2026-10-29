import { create } from 'zustand';

// View state the workbench keeps per project (architect key) for the window's
// lifetime, so switching projects and back restores it. Deliberately not
// persisted.
export interface BoardSearchState {
  open: boolean;
  text: string;
}

const CLOSED_SEARCH: BoardSearchState = { open: false, text: '' };

interface ProjectViewState {
  boardSearch: Record<string, BoardSearchState>;
  setBoardSearch(architectKey: string, update: Partial<BoardSearchState>): void;
}

export const useProjectViewStore = create<ProjectViewState>((set) => ({
  boardSearch: {},
  setBoardSearch(architectKey, update) {
    set((state) => ({
      boardSearch: {
        ...state.boardSearch,
        [architectKey]: { ...(state.boardSearch[architectKey] ?? CLOSED_SEARCH), ...update },
      },
    }));
  },
}));

export function useBoardSearch(architectKey: string): BoardSearchState {
  return useProjectViewStore((state) => state.boardSearch[architectKey] ?? CLOSED_SEARCH);
}
