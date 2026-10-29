import { create } from 'zustand';

// Session sidebar UI state. The collapsed flag and the width are per-viewer
// conveniences kept in localStorage; the sidebar must work without them (private
// window, cleared storage).
const COLLAPSED_STORAGE_KEY = 'hiveryn.sidebar.collapsed';
const WIDTH_STORAGE_KEY = 'hiveryn.sidebar.width';

// Expanded width bounds in CSS pixels. The width never depends on the length of
// an architect name or a worker title (those truncate). The workspace keeps at
// least SIDEBAR_WORKSPACE_MIN_PX beside it; the stylesheet re-applies the same
// bound against the live window width, so shrinking the window clamps the
// sidebar too.
export const SIDEBAR_DEFAULT_WIDTH_PX = 280;
export const SIDEBAR_MIN_WIDTH_PX = 200;
export const SIDEBAR_MAX_WIDTH_PX = 520;
export const SIDEBAR_WORKSPACE_MIN_PX = 560;

/** The sidebar width to apply for a requested width and window width. */
export function clampSidebarWidth(width: number, windowWidth: number): number {
  const max = Math.min(SIDEBAR_MAX_WIDTH_PX, windowWidth - SIDEBAR_WORKSPACE_MIN_PX);
  return Math.round(Math.max(SIDEBAR_MIN_WIDTH_PX, Math.min(width, max)));
}

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function readWidth(): number {
  try {
    const stored = Number(globalThis.localStorage?.getItem(WIDTH_STORAGE_KEY));
    if (
      Number.isFinite(stored) &&
      stored >= SIDEBAR_MIN_WIDTH_PX &&
      stored <= SIDEBAR_MAX_WIDTH_PX
    ) {
      return stored;
    }
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return SIDEBAR_DEFAULT_WIDTH_PX;
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage unavailable: the state just isn't remembered across launches.
  }
}

interface SidebarState {
  collapsed: boolean;
  // Requested expanded width in CSS pixels (already within the fixed bounds).
  width: number;
  // Bumped to ask the sidebar to focus its search field (after expanding).
  searchFocusRequest: number;
  setCollapsed(collapsed: boolean): void;
  toggleCollapsed(): void;
  setWidth(width: number): void;
  // Expands the sidebar and focuses its search: the in-app sidebar-search
  // binding, the tray icon and the OS-global shortcut raising a background
  // window.
  revealSearch(): void;
  // The OS-global shortcut on the frontmost window: collapses an expanded
  // sidebar, expands a collapsed one with its search focused.
  toggleSearch(): void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  collapsed: readCollapsed(),
  width: readWidth(),
  searchFocusRequest: 0,
  setCollapsed(collapsed) {
    write(COLLAPSED_STORAGE_KEY, String(collapsed));
    set({ collapsed });
  },
  toggleCollapsed() {
    get().setCollapsed(!get().collapsed);
  },
  setWidth(width) {
    const bounded = Math.round(
      Math.max(SIDEBAR_MIN_WIDTH_PX, Math.min(width, SIDEBAR_MAX_WIDTH_PX)),
    );
    write(WIDTH_STORAGE_KEY, String(bounded));
    set({ width: bounded });
  },
  revealSearch() {
    write(COLLAPSED_STORAGE_KEY, 'false');
    set((state) => ({ collapsed: false, searchFocusRequest: state.searchFocusRequest + 1 }));
  },
  toggleSearch() {
    if (get().collapsed) get().revealSearch();
    else get().setCollapsed(true);
  },
}));
