import { useEffect } from 'react';
import {
  type SessionRecord,
  type TerminalRecord,
  useSessionStore,
} from '../../../state/sessionStore';

// Restores running sessions and their terminals from the daemon into the store.
// Replaces ArchitectTerminal's ad-hoc session lookup and index.tsx's restore loop.
export function useSessionRestore(architectKey: string): void {
  useEffect(() => {
    if (!architectKey) return;
    let cancelled = false;

    async function restore() {
      try {
        const sessions = await window.hiveryn.sessions.list();
        if (cancelled) return;

        for (const s of sessions) {
          if (s.status !== 'running' || s.architect_key !== architectKey) continue;

          let terminals: { name: string; ws_url: string }[];
          try {
            terminals = await window.hiveryn.terminals.list(s.id);
          } catch {
            continue;
          }
          if (cancelled) return;

          const main = terminals.find((t) => t.name === 'main');
          if (!main) continue;

          const isArchitect = s.kind === 'architect';
          const label = isArchitect ? 'Architect' : s.label || s.ticket_id;
          if (!label) continue;

          const record: SessionRecord = {
            id: s.id,
            type: isArchitect ? 'architect' : 'work',
            label,
            ticketId: s.ticket_id,
            terminals: {},
          };

          for (const term of terminals) {
            const terminal: TerminalRecord = {
              sessionId: s.id,
              name: term.name,
              wsUrl: term.ws_url,
              status: 'connecting',
            };
            record.terminals[term.name] = terminal;
          }

          useSessionStore.getState().registerSession(record);

          // Pick a sensible default active session: prefer architect.
          const store = useSessionStore.getState();
          if (!store.activeSessionId || isArchitect) {
            store.setActiveSession(s.id);
          }
        }
      } catch {
        // Non-fatal — user can spawn manually.
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [architectKey]);
}
