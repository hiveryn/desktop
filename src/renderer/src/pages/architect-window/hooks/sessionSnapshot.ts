import type { Session, SessionTab } from '../../../../../shared/types';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';

function sessionLabel(session: Session): string {
  if (session.session_type === 'architect') {
    return 'Architect';
  }
  const label = session.ticket_id || session.profile_name;
  if (!label) {
    throw new Error(`Running session ${session.id} is missing label fields`);
  }
  return label;
}

export function buildSessionRecord(session: Session, tabs: SessionTab[]): SessionRecord {
  if (session.status !== 'running') {
    throw new Error(`Cannot build session record for non-running session ${session.id}`);
  }
  if (!session.main_terminal_id) {
    throw new Error(`Running session ${session.id} is missing main_terminal_id`);
  }

  return {
    id: session.id,
    type: session.session_type === 'architect' ? 'architect' : 'work',
    label: sessionLabel(session),
    ticketId: session.ticket_id,
    mainTerminalId: session.main_terminal_id,
    tabs,
  };
}

export async function loadSessionRecord(sessionId: string): Promise<SessionRecord | null> {
  const sessions = await window.hiveryn.sessions.list();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session || session.status !== 'running') {
    return null;
  }

  const tabs = await window.hiveryn.tabs.list(session.id);
  return buildSessionRecord(session, tabs);
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
  const sessions = await window.hiveryn.sessions.list();
  const running = sessions.filter(
    (session) => session.status === 'running' && session.architect_key === architectKey,
  );

  const tabsBySession = await Promise.all(
    running.map((session) => window.hiveryn.tabs.list(session.id)),
  );
  return running.map((session, index) => buildSessionRecord(session, tabsBySession[index]));
}

export async function restoreSessionsForArchitect(architectKey: string): Promise<void> {
  const records = await loadSessionRecordsForArchitect(architectKey);
  useSessionStore.getState().reconcileSessions(records);
}
