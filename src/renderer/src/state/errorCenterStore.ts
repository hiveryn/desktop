import { create } from 'zustand';

export interface ErrorCenterEntry {
  id: string;
  timestamp: number;
  title: string;
  message: string;
  requestId?: string;
  code?: string;
  details?: Record<string, unknown> | null;
  stacktrace?: string;
  read: boolean;
}

interface ErrorCenterState {
  entries: ErrorCenterEntry[];
  unreadCount: number;
  sheetOpen: boolean;
}

interface ErrorCenterActions {
  pushError(entry: Omit<ErrorCenterEntry, 'id' | 'read'>): void;
  dismissError(id: string): void;
  clearAll(): void;
  openSheet(): void;
  closeSheet(): void;
}

type ErrorCenterStore = ErrorCenterState & ErrorCenterActions;

export const useErrorCenterStore = create<ErrorCenterStore>((set) => ({
  entries: [],
  unreadCount: 0,
  sheetOpen: false,
  pushError(entry) {
    set((state) => ({
      entries: [{ ...entry, id: crypto.randomUUID(), read: false }, ...state.entries],
      unreadCount: state.unreadCount + 1,
    }));
  },
  dismissError(id) {
    set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
  },
  clearAll() {
    set({ entries: [], unreadCount: 0 });
  },
  openSheet() {
    set({ sheetOpen: true, unreadCount: 0 });
  },
  closeSheet() {
    set({ sheetOpen: false });
  },
}));
