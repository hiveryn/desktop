import { useEffect } from 'react';
import { useSessionStore } from '../../../state/sessionStore';
import { loadSessionRecordsForArchitect } from './sessionSnapshot';

// Restores running sessions, their main terminal UUIDs, and daemon-owned right-pane tabs.
export function useSessionRestore(architectKey: string): void {
  useEffect(() => {
    if (!architectKey) return;
    let cancelled = false;

    async function restore() {
      const records = await loadSessionRecordsForArchitect(architectKey);
      if (cancelled) return;
      useSessionStore.getState().reconcileSessions(records);
      await Promise.all(records.map((r) => window.hiveryn.session.subscribe(r.id)));
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [architectKey]);
}
