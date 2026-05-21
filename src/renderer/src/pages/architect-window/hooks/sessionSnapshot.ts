import type { SessionIntent, SessionTab } from '../../../../../shared/types';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';

function sessionLabel(intent: SessionIntent): string {
  if (intent.session_type === 'architect') {
    return 'Architect';
  }
  const label = intent.context_id || intent.current_run?.profile_name;
  if (!label) {
    throw new Error(`Running session ${intent.id} is missing label fields`);
  }
  return label;
}

export function buildSessionRecord(intent: SessionIntent, tabs: SessionTab[]): SessionRecord {
  if (intent.current_run?.status !== 'running') {
    throw new Error(`Cannot build session record for non-running session ${intent.id}`);
  }
  if (!intent.current_run.main_terminal_id) {
    throw new Error(`Running session ${intent.id} is missing main_terminal_id`);
  }

  return {
    id: intent.id,
    type: intent.session_type,
    label: sessionLabel(intent),
    contextId: intent.context_id,
    mainTerminalId: intent.current_run.main_terminal_id,
    tabs,
  };
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

export async function loadSessionRecordsForArchitect(
  architectKey: string,
): Promise<SessionRecord[]> {
  const intents = await window.hiveryn.sessions.list();
  const running = intents.filter(
    (intent) => intent.current_run?.status === 'running' && intent.architect_key === architectKey,
  );

  const tabsBySession = await Promise.all(
    running.map((intent) => window.hiveryn.tabs.list(intent.id)),
  );
  return running.map((intent, index) => buildSessionRecord(intent, tabsBySession[index]));
}

export async function restoreSessionsForArchitect(architectKey: string): Promise<void> {
  const records = await loadSessionRecordsForArchitect(architectKey);
  useSessionStore.getState().reconcileSessions(records);
}
