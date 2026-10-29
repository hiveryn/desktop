import { useEffect } from 'react';
import { useSidebarStore } from '../../../state/sidebarStore';
import { selectSession } from '../navigation';

// Requests from the main process: the OS-global shortcut and the tray icon
// reveal the sidebar search; a notification click selects its session.
export function useWorkbenchRequests(): void {
  useEffect(
    () =>
      window.hiveryn.workbench.onRequest((request) => {
        if (request.type === 'reveal-sidebar-search') {
          useSidebarStore.getState().revealSearch();
          return;
        }
        void selectSession(request.architectKey, request.sessionId);
      }),
    [],
  );
}
