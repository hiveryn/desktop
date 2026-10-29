import { create } from 'zustand';

// Session sidebar UI state. The collapsed flag is a per-viewer convenience kept
// in localStorage; it must work without it (private window, cleared storage).
const COLLAPSED_STORAGE_KEY = 'hiveryn.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage?.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage unavailable: the state just isn't remembered across launches.
  }
}

interface SidebarState {
  collapsed: boolean;
  // Bumped to ask the sidebar to focus its search field (after expanding).
  searchFocusRequest: number;
  setCollapsed(collapsed: boolean): void;
  toggleCollapsed(): void;
  // Expands the sidebar and focuses its search: the in-app sidebar-search
  // binding, the OS-global shortcut and the tray icon.
  revealSearch(): void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: readCollapsed(),
  searchFocusRequest: 0,
  setCollapsed(collapsed) {
    writeCollapsed(collapsed);
    set({ collapsed });
  },
  toggleCollapsed() {
    set((state) => {
      writeCollapsed(!state.collapsed);
      return { collapsed: !state.collapsed };
    });
  },
  revealSearch() {
    writeCollapsed(false);
    set((state) => ({ collapsed: false, searchFocusRequest: state.searchFocusRequest + 1 }));
  },
}));
