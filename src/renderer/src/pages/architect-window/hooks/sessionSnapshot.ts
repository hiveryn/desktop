import type { Session, SessionTab } from '@hiveryn/shared/domain';
import { useErrorCenterStore } from '../../../state/errorCenterStore';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';

function sessionLabel(intent: Session): string {
  if (intent.session_type === 'architect') {
    return 'Architect';
  }
  const label = intent.context_id || intent.current_run?.profile_name;
  if (!label) {
    throw new Error(`Running session ${intent.id} is missing label fields`);
  }
  return label;
}

// label overrides the derived tab label (the Actions window names a tab after
// its action rather than the execution id held in context_id).
export function buildSessionRecord(
  intent: Session,
  tabs: SessionTab[],
  label?: string,
): SessionRecord {
  if (intent.current_run?.status !== 'running') {
    throw new Error(`Cannot build session record for non-running session ${intent.id}`);
  }
  if (!intent.current_run.main_terminal_id) {
    throw new Error(`Running session ${intent.id} is missing main_terminal_id`);
  }

  return {
    id: intent.id,
    type: intent.session_type,
    label: label ?? sessionLabel(intent),
    contextId: intent.context_id,
    mainTerminalId: intent.current_run.main_terminal_id,
    tabs,
    status: intent.current_run.agent_status,
  };
}

// A session the daemon reports as running but that the desktop cannot turn into
// a tab is the exact failure this whole path exists to make visible: the daemon
// spawned something real and the UI dropped it. Surface it with enough context
// to correlate against the daemon's own logs, and keep going — one unrenderable
// session must not blank out the window's other sessions.
function reportSessionDiscoveryFailure(
  architectKey: string,
  session: Session,
  error: unknown,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  useErrorCenterStore.getState().pushError({
    title: 'Session discovery',
    message: `Session ${session.id} could not be surfaced in architect ${architectKey}: ${err.message}`,
    timestamp: Date.now(),
    details: {
      architect_key: architectKey,
      session_id: session.id,
      session_type: session.session_type,
      context_id: session.context_id,
      created_by: session.created_by,
      run_status: session.current_run?.status ?? null,
      run_id: session.current_run?.id ?? null,
      main_terminal_id: session.current_run?.main_terminal_id ?? null,
    },
    stacktrace: err.stack,
  });
}

export async function loadSessionRecord(sessionId: string): Promise<SessionRecord | null> {
  const intents = await window.hiveryn.sessions.list();
  const intent = intents.find((candidate) => candidate.id === sessionId);
  if (!intent || intent.current_run?.status !== 'running') {
    return null;
  }

  const tabs = await window.hiveryn.tabs.list(intent.id);
  return buildSessionRecord(intent, tabs);
}

export async function refreshSessionFromDaemon(sessionId: string): Promise<void> {
  const record = await loadSessionRecord(sessionId);
  const store = useSessionStore.getState();
  if (!record) {
    store.unregisterSession(sessionId);
    return;
  }
  store.registerSession(record);
  store.setSessionTabs(sessionId, record.tabs);
}

// Discovery runs on several triggers at once (mount, each lifecycle event,
// stream reconnect, daemon recovery), and reconcileSessions replaces the whole
// session map. Two overlapping syncs could therefore land out of order and let
// an older snapshot clobber a newer one — reintroducing the exact symptom this
// path exists to fix. Chaining keeps them strictly sequential per architect.
const syncChains = new Map<string, Promise<unknown>>();

/**
 * The single session-discovery path for an architect window.
 *
 * The desktop cannot learn about a session from that session's own event stream
 * (subscribing requires knowing the id), so discovery is always a refetch. This
 * runs on mount, on every architect-stream session lifecycle event, on stream
 * (re)connect, and on daemon recovery — so it has to be safe to call repeatedly.
 * It is: `reconcileSessions` is keyed by session id, so redelivery cannot
 * produce duplicate tabs, and `session.subscribe` is a no-op when the SSE stream
 * for that session is already running.
 *
 * Returns the ids that were not already registered, so a caller can distinguish
 * "a session just appeared" from "we resynced and nothing changed".
 */
export function syncSessionsForArchitect(architectKey: string): Promise<string[]> {
  const previous = syncChains.get(architectKey) ?? Promise.resolve();
  // A failed sync must not break the chain for every later one, so swallow the
  // previous result here only — the failure itself still rejects its own caller.
  const next = previous.catch(() => undefined).then(() => runSync(architectKey));
  syncChains.set(
    architectKey,
    next.catch(() => undefined),
  );
  return next;
}

async function runSync(architectKey: string): Promise<string[]> {
  const known = new Set(Object.keys(useSessionStore.getState().sessions));

  const sessions = await window.hiveryn.sessions.list();
  const running = sessions.filter(
    (session) =>
      session.current_run?.status === 'running' && session.architect_key === architectKey,
  );

  const tabsBySession = await Promise.all(
    running.map((session) => window.hiveryn.tabs.list(session.id)),
  );

  const records: SessionRecord[] = [];
  running.forEach((session, index) => {
    try {
      records.push(buildSessionRecord(session, tabsBySession[index]));
    } catch (error: unknown) {
      reportSessionDiscoveryFailure(architectKey, session, error);
    }
  });

  useSessionStore.getState().reconcileSessions(records);

  // Subscribe after reconciling: a tab without its event stream would render but
  // never update its agent status, intents, or conclusion.
  await Promise.all(records.map((record) => window.hiveryn.session.subscribe(record.id)));

  return records.map((record) => record.id).filter((id) => !known.has(id));
}
