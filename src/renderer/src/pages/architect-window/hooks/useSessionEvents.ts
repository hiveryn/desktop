import type { CommitRef } from '@hiveryn/shared/domain';
import { useEffect, useRef } from 'react';
import { useSessionStore } from '../../../state/sessionStore';

function parseApprovalCommits(event: { raw?: Record<string, unknown> }): CommitRef[] {
  const commits = event.raw?.commits;
  if (commits === undefined) return [];
  if (!Array.isArray(commits)) {
    throw new Error(`approval_required event has non-array raw.commits: ${JSON.stringify(event)}`);
  }
  return commits.map((commit) => {
    const sha = (commit as { sha?: unknown }).sha;
    const repo = (commit as { repo?: unknown }).repo;
    if (typeof sha !== 'string' || typeof repo !== 'string') {
      throw new Error(`approval_required commit missing sha/repo: ${JSON.stringify(commit)}`);
    }
    return { sha, repo };
  });
}

interface MainTerminalResumeEvent {
  mainTerminalId: string;
  previousTerminalId: string;
}

function mainTerminalResumeEvent(event: {
  raw?: Record<string, unknown>;
}): MainTerminalResumeEvent {
  const mainTerminalID = event.raw?.main_terminal_id;
  if (typeof mainTerminalID !== 'string' || mainTerminalID.trim() === '') {
    throw new Error(`main_terminal_resumed missing main_terminal_id: ${JSON.stringify(event.raw)}`);
  }

  const previousTerminalID = event.raw?.previous_terminal_id;
  if (typeof previousTerminalID !== 'string' || previousTerminalID.trim() === '') {
    throw new Error(
      `main_terminal_resumed missing previous_terminal_id: ${JSON.stringify(event.raw)}`,
    );
  }

  return { mainTerminalId: mainTerminalID, previousTerminalId: previousTerminalID };
}

// A session end that should tear down the tab: either concluded (normal) or
// discarded (ticket session moved back to backlog as if never spawned).
function isFinalSessionEnd(event: { raw?: Record<string, unknown> }): boolean {
  const lifecycle = event.raw?.lifecycle;
  return lifecycle === 'concluded' || lifecycle === 'discarded';
}

async function cleanupEndedSession(
  sessionId: string,
  sessionType: 'architect' | 'ticket' | 'freeform',
): Promise<void> {
  await window.hiveryn.session.disconnect(sessionId);

  const store = useSessionStore.getState();
  const architectId =
    Object.values(store.sessions).find(
      (session) => session.type === 'architect' && session.id !== sessionId,
    )?.id ?? null;

  store.unregisterSession(sessionId);

  if (sessionType === 'architect') {
    await window.hiveryn.architect.closeWindow();
    return;
  }

  store.setActiveSession(architectId);
  store.setFocusedPane(architectId ? 'main-terminal' : 'right-event-log');
}

export function useSessionEvents(): void {
  const endingSessionIdsRef = useRef(new Set<string>());

  useEffect(() => {
    return window.hiveryn.session.onEvent((event) => {
      const store = useSessionStore.getState();
      store.appendEvent(event);

      if (event.type === 'main_terminal_resumed') {
        const session = store.sessions[event.session_intent_id];
        if (!session) {
          throw new Error(
            `main_terminal_resumed received for missing session ${event.session_intent_id}`,
          );
        }
        const resume = mainTerminalResumeEvent(event);
        if (session.mainTerminalId === resume.mainTerminalId) return;
        if (session.mainTerminalId !== resume.previousTerminalId) return;
        store.updateSessionMainTerminal(event.session_intent_id, resume.mainTerminalId);
        return;
      }

      if (event.type === 'status' && event.status === 'approval_required') {
        const body = event.raw?.body;
        if (typeof body !== 'string' || !body) {
          throw new Error(`approval_required event missing raw.body: ${JSON.stringify(event)}`);
        }
        const timeoutSeconds = event.raw?.timeout_seconds;
        if (typeof timeoutSeconds !== 'number' || timeoutSeconds <= 0) {
          throw new Error(
            `approval_required event missing valid raw.timeout_seconds: ${JSON.stringify(event)}`,
          );
        }
        const rejectionReason = event.raw?.rejection_reason;
        if (rejectionReason !== undefined && typeof rejectionReason !== 'string') {
          throw new Error(
            `approval_required event has non-string raw.rejection_reason: ${JSON.stringify(event)}`,
          );
        }
        store.setPendingApproval({
          sessionId: event.session_intent_id,
          body,
          timeoutSeconds,
          commits: parseApprovalCommits(event),
          rejected: event.raw?.rejected === true,
          rejectionReason: rejectionReason ?? '',
        });
        return;
      }

      // Durable counterpart to approval_required: clears the dialog when the
      // approval was rejected, cancelled, or orphaned by a daemon restart. The
      // SSE backlog replays in order, so a resolved event following a required
      // event nets to "no dialog" on reconnect.
      if (event.type === 'status' && event.status === 'approval_resolved') {
        store.clearPendingApproval(event.session_intent_id);
        return;
      }

      if (event.type !== 'status' || event.status !== 'ended' || !isFinalSessionEnd(event)) {
        return;
      }
      if (endingSessionIdsRef.current.has(event.session_intent_id)) return;

      const session = store.sessions[event.session_intent_id];
      if (!session) return;

      endingSessionIdsRef.current.add(event.session_intent_id);
      void cleanupEndedSession(event.session_intent_id, session.type);
    });
  }, []);
}
