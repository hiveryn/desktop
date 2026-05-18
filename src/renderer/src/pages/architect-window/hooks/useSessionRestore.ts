import { useEffect } from 'react';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';

// Restores running sessions, their main terminal UUIDs, and daemon-owned right-pane tabs.
export function useSessionRestore(architectKey: string): void {
  useEffect(() => {
    if (!architectKey) return;
    let cancelled = false;

    async function restore() {
      const sessions = await window.hiveryn.sessions.list();
      if (cancelled) return;

      for (const s of sessions) {
        if (s.status !== 'running' || s.architect_key !== architectKey) continue;
        if (!s.main_terminal_id) {
          throw new Error(`Running session ${s.id} is missing main_terminal_id`);
        }

        const tabs = await window.hiveryn.tabs.list(s.id);
        if (cancelled) return;

        const isArchitect = s.session_type === 'architect';
        const label = isArchitect ? 'Architect' : s.ticket_id || s.profile_name;
        if (!label) {
          throw new Error(`Running session ${s.id} is missing label fields`);
        }

        const record: SessionRecord = {
          id: s.id,
          type: isArchitect ? 'architect' : 'work',
          label,
          ticketId: s.ticket_id,
          mainTerminalId: s.main_terminal_id,
          tabs,
        };

        useSessionStore.getState().registerSession(record);

        // Pick a sensible default active session: prefer architect.
        const store = useSessionStore.getState();
        if (!store.activeSessionId || isArchitect) {
          store.setActiveSession(s.id);
        }
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [architectKey]);
}
