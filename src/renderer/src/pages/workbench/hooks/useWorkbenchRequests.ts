import { useEffect } from 'react';
import { useSidebarStore } from '../../../state/sidebarStore';
import { selectSession } from '../navigation';

// Requests from the main process: the tray icon reveals the sidebar search, the
// OS-global shortcut toggles the sidebar (or reveals it on a background window);
// a notification click selects its session.
export function useWorkbenchRequests(): void {
  useEffect(
    () =>
      window.hiveryn.workbench.onRequest((request) => {
        switch (request.type) {
          case 'reveal-sidebar-search':
            useSidebarStore.getState().revealSearch();
            return;
          case 'toggle-sidebar-search':
            useSidebarStore.getState().toggleSearch();
            return;
          case 'select-session':
            void selectSession(request.architectKey, request.sessionId);
            return;
        }
      }),
    [],
  );
}
