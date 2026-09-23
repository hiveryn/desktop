import { useEffect } from 'react';
import { create } from 'zustand';
import { useSessionStore } from './sessionStore';

// One repository in a ticket session's scope: the repo key paired with the
// session's immutable resolved working directory for it.
export interface RepoScopeEntry {
  repoKey: string;
  workdir: string;
}

// The per-session repository scope, derived once from the ticket (primary repo
// key) and the session snapshot (primary workdir + the daemon's positionally
// aligned additional_repos / additional_workdirs). This is the single source
// both the Files and Git review panes read, so they can never derive
// conflicting defaults.
//
//  - loading: fetch in flight
//  - none:    not a ticket session (architect) — no ticket repo scope
//  - error:   ticket/session data is missing or invalid; surfaced, never masked
//             behind a workspace fallback
//  - ready:   primary + additional repositories resolved from the snapshot
export type SessionRepoScope =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; primary: RepoScopeEntry; additional: RepoScopeEntry[] };

// The ticket owns the primary repo *key*; the session snapshot owns the
// primary *workdir* and the aligned additional repo/workdir arrays. Missing or
// misaligned data throws (fail fast) so the pane renders a visible error.
async function fetchScope(sessionId: string): Promise<SessionRepoScope> {
  const [ticket, session] = await Promise.all([
    window.hiveryn.sessions.getTicket(sessionId),
    window.hiveryn.sessions.get(sessionId),
  ]);

  if (!ticket.repo) {
    throw new Error(`ticket ${ticket.id} for session ${sessionId} has no primary repo`);
  }
  if (!session.workdir) {
    throw new Error(`session ${sessionId} snapshot has no primary workdir`);
  }
  const repos = session.additional_repos;
  const workdirs = session.additional_workdirs;
  if (repos.length !== workdirs.length) {
    throw new Error(
      `session ${sessionId} snapshot misaligned: ${repos.length} additional_repos vs ` +
        `${workdirs.length} additional_workdirs`,
    );
  }

  return {
    status: 'ready',
    primary: { repoKey: ticket.repo, workdir: session.workdir },
    additional: repos.map((repoKey, i) => ({ repoKey, workdir: workdirs[i] })),
  };
}

interface SessionRepoScopeState {
  bySession: Record<string, SessionRepoScope>;
  // Idempotent per session — ticket and session snapshots are immutable, so a
  // resolved scope is never refetched. Non-ticket sessions settle to 'none'
  // without hitting the daemon.
  load(sessionId: string, isTicketSession: boolean): void;
  clear(sessionId: string): void;
}

export const useSessionRepoScopeStore = create<SessionRepoScopeState>((set, get) => ({
  bySession: {},

  load(sessionId, isTicketSession) {
    if (get().bySession[sessionId]) return;

    if (!isTicketSession) {
      set((state) => ({ bySession: { ...state.bySession, [sessionId]: { status: 'none' } } }));
      return;
    }

    set((state) => ({ bySession: { ...state.bySession, [sessionId]: { status: 'loading' } } }));
    fetchScope(sessionId).then(
      (scope) => set((state) => ({ bySession: { ...state.bySession, [sessionId]: scope } })),
      (error) =>
        set((state) => ({
          bySession: { ...state.bySession, [sessionId]: { status: 'error', error } },
        })),
    );
  },

  clear(sessionId) {
    set((state) => {
      if (!(sessionId in state.bySession)) return state;
      const { [sessionId]: _removed, ...bySession } = state.bySession;
      return { bySession };
    });
  },
}));

// Reads (and lazily populates) the repository scope for a session. Both the
// Files pane and the Git review pane call this with the same sessionId, so they
// share one resolved scope.
export function useSessionRepoScope(sessionId: string | undefined): SessionRepoScope {
  const isTicketSession = useSessionStore((s) =>
    sessionId ? s.sessions[sessionId]?.type === 'ticket' : false,
  );
  const sessionExists = useSessionStore((s) => (sessionId ? sessionId in s.sessions : false));
  const scope = useSessionRepoScopeStore((s) => (sessionId ? s.bySession[sessionId] : undefined));
  const load = useSessionRepoScopeStore((s) => s.load);

  useEffect(() => {
    if (!sessionId || !sessionExists) return;
    load(sessionId, isTicketSession);
  }, [sessionId, sessionExists, isTicketSession, load]);

  return scope ?? { status: 'loading' };
}
