import { create } from 'zustand';
import type { ArchitectStatus } from '../../../../../shared/types';
import { useArchitectStatusStore } from '../../../state/architectStatusStore';
import { useSessionStore } from '../../../state/sessionStore';
import { useSidebarStore } from '../../../state/sidebarStore';
import { focusActivePane } from '../focusActivePane';
import { selectSession } from '../navigation';

// The one way to open an architect from the sidebar or the launcher view. A
// running architect session is selected (never launched twice); otherwise the
// user picks a variant and its architect session is created and started, then
// selected — unless the user selected something else while it launched.
//
// `collapse` (keyboard confirmation in the sidebar) collapses the sidebar and
// hands focus to the workspace once the session is shown — never after a
// cancelled pick, a failed launch or a selection the user has since replaced.
interface ArchitectLaunchState {
  // Architect whose variant is being picked.
  pickingKey: string | null;
  // Whether the pick was opened with `collapse`.
  collapseOnLaunch: boolean;
  // Architect whose session is being created and started.
  launchingKey: string | null;
  open(architect: ArchitectStatus, options?: { collapse?: boolean }): Promise<boolean>;
  cancelPick(): void;
  launch(profileName: string): Promise<void>;
}

export const useArchitectLaunch = create<ArchitectLaunchState>((set, get) => ({
  pickingKey: null,
  collapseOnLaunch: false,
  launchingKey: null,

  // Resolves true when a running architect session was shown; false when a
  // variant pick was opened instead (or nothing happened).
  async open(architect, options) {
    if (architect.session_id) {
      return selectSession(architect.key, architect.session_id);
    }
    if (get().launchingKey) return false;
    set({ pickingKey: architect.key, collapseOnLaunch: options?.collapse ?? false });
    return false;
  },

  cancelPick() {
    set({ pickingKey: null, collapseOnLaunch: false });
  },

  async launch(profileName) {
    const key = get().pickingKey;
    if (!key) return;
    const collapse = get().collapseOnLaunch;
    set({ pickingKey: null, collapseOnLaunch: false, launchingKey: key });
    const epoch = useSessionStore.getState().selectionEpoch;
    try {
      const session = await window.hiveryn.sessions.create('architect', key);
      await window.hiveryn.sessions.createRun(session.id, profileName);
      void useArchitectStatusStore.getState().refresh();
      // A launch can take minutes; a newer selection by the user wins.
      if (useSessionStore.getState().selectionEpoch === epoch) {
        const shown = await selectSession(key, session.id);
        if (shown && collapse) {
          useSidebarStore.getState().setCollapsed(true);
          focusActivePane();
        }
      }
    } catch {
      // Captured centrally by the request bridge (error center).
    } finally {
      set({ launchingKey: null });
    }
  },
}));
