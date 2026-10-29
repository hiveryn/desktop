import { create } from 'zustand';
import type { ArchitectStatus } from '../../../../../shared/types';
import { useArchitectStatusStore } from '../../../state/architectStatusStore';
import { useSessionStore } from '../../../state/sessionStore';
import { selectSession } from '../navigation';

// The one way to open an architect from the sidebar or the launcher view. A
// running architect session is selected (never launched twice); otherwise the
// user picks a variant and its architect session is created and started, then
// selected — unless the user selected something else while it launched.
interface ArchitectLaunchState {
  // Architect whose variant is being picked.
  pickingKey: string | null;
  // Architect whose session is being created and started.
  launchingKey: string | null;
  open(architect: ArchitectStatus): void;
  cancelPick(): void;
  launch(profileName: string): Promise<void>;
}

export const useArchitectLaunch = create<ArchitectLaunchState>((set, get) => ({
  pickingKey: null,
  launchingKey: null,

  open(architect) {
    if (architect.session_id) {
      void selectSession(architect.key, architect.session_id);
      return;
    }
    if (get().launchingKey) return;
    set({ pickingKey: architect.key });
  },

  cancelPick() {
    set({ pickingKey: null });
  },

  async launch(profileName) {
    const key = get().pickingKey;
    if (!key) return;
    set({ pickingKey: null, launchingKey: key });
    const epoch = useSessionStore.getState().selectionEpoch;
    try {
      const session = await window.hiveryn.sessions.create('architect', key);
      await window.hiveryn.sessions.createRun(session.id, profileName);
      void useArchitectStatusStore.getState().refresh();
      // A launch can take minutes; a newer selection by the user wins.
      if (useSessionStore.getState().selectionEpoch === epoch) {
        await selectSession(key, session.id);
      }
    } catch {
      // Captured centrally by the request bridge (error center).
    } finally {
      set({ launchingKey: null });
    }
  },
}));
