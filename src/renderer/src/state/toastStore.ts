import { create } from 'zustand';

export interface ToastEntry {
  id: string;
  timestamp: number;
  title: string;
  message: string;
}

interface ToastState {
  toasts: ToastEntry[];
}

interface ToastActions {
  pushToast(toast: Omit<ToastEntry, 'id' | 'timestamp'>): void;
  dismissToast(id: string): void;
}

type ToastStore = ToastState & ToastActions;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  pushToast(toast) {
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID(), timestamp: Date.now() }],
    }));
  },
  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
