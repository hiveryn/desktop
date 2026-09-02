import { create } from 'zustand';

// Window-lifetime view state for the Roadmap pane — Current/Archive switch,
// selection, and collapsed nodes. Deliberately not persisted (same spirit as
// paneLayoutStore.ts): each architect window is pinned to one architect key
// for its lifetime, so a fresh window/architect naturally starts clean and
// state can never leak across architects.

interface RoadmapState {
  view: 'current' | 'archive';
  selectedItemId: string | null;
  // The archived root currently drilled into, or null while browsing the
  // compact root list.
  selectedArchiveRootId: string | null;
  collapsedIds: ReadonlySet<string>;
}

interface RoadmapActions {
  setView(view: 'current' | 'archive'): void;
  setSelectedItemId(id: string | null): void;
  setSelectedArchiveRootId(id: string | null): void;
  toggleCollapsed(id: string): void;
}

export const useRoadmapStore = create<RoadmapState & RoadmapActions>((set) => ({
  view: 'current',
  selectedItemId: null,
  selectedArchiveRootId: null,
  collapsedIds: new Set(),
  setView(view) {
    set({ view, selectedArchiveRootId: null, selectedItemId: null });
  },
  setSelectedItemId(id) {
    set({ selectedItemId: id });
  },
  setSelectedArchiveRootId(id) {
    set({ selectedArchiveRootId: id, selectedItemId: null });
  },
  toggleCollapsed(id) {
    set((state) => {
      const next = new Set(state.collapsedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { collapsedIds: next };
    });
  },
}));
