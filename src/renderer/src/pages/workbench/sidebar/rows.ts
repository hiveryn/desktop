import type { Companion, CompanionStatus } from '@hiveryn/shared/domain';
import type { ArchitectStatus, ArchitectStatusSession } from '../../../../../shared/types';

export type SidebarRow =
  | { kind: 'architect'; architect: ArchitectStatus; active: boolean }
  | { kind: 'companion'; architect: ArchitectStatus; companion: Companion }
  | { kind: 'session'; architect: ArchitectStatus; session: ArchitectStatusSession };

export function rowKey(row: SidebarRow): string {
  switch (row.kind) {
    case 'architect':
      return `architect:${row.architect.key}`;
    case 'companion':
      return `companion:${row.architect.key}:${row.companion.name}`;
    case 'session':
      return `session:${row.session.id}`;
  }
}

// Companion statuses whose session is still there to show: its terminal stays
// selectable until the daemon confirms termination (stop_failed keeps it).
const LIVE_COMPANION_STATUSES: readonly CompanionStatus[] = [
  'running',
  'shutdown_requested',
  'stopping',
  'stop_failed',
];

// The companion's session id when it can be shown; null when it has none
// (starting, never started, stopped, failed).
export function companionSessionId(companion: Companion): string | null {
  return companion.session_id && LIVE_COMPANION_STATUSES.includes(companion.status)
    ? companion.session_id
    : null;
}

// An architect is active when it has a running architect session (`status`
// is the agent_status of that session, null when none is running) or any
// running worker sessions — not just when worker sessions are present, since
// a freshly-restarted architect may be running with no workers spawned yet.
export function isArchitectActive(architect: ArchitectStatus): boolean {
  return architect.status !== null || architect.sessions.length > 0;
}

export function buildRows(statuses: ArchitectStatus[], query: string): SidebarRow[] {
  const q = query.toLowerCase().trim();
  const active: ArchitectStatus[] = [];
  const inactive: ArchitectStatus[] = [];
  for (const architect of statuses) {
    if (isArchitectActive(architect)) active.push(architect);
    else inactive.push(architect);
  }

  const rows: SidebarRow[] = [];
  for (const architect of [...active, ...inactive]) {
    const isActive = isArchitectActive(architect);
    const companions = architect.companions;
    if (!q) {
      rows.push({ kind: 'architect', architect, active: isActive });
      for (const companion of companions) {
        rows.push({ kind: 'companion', architect, companion });
      }
      for (const session of architect.sessions) {
        rows.push({ kind: 'session', architect, session });
      }
      continue;
    }

    const keyMatches = architect.key.toLowerCase().includes(q);
    const matchingCompanions = companions.filter((c) => c.name.toLowerCase().includes(q));
    const matchingSessions = architect.sessions.filter((s) => s.title.toLowerCase().includes(q));
    if (!keyMatches && matchingCompanions.length === 0 && matchingSessions.length === 0) continue;

    rows.push({ kind: 'architect', architect, active: isActive });
    for (const companion of keyMatches ? companions : matchingCompanions) {
      rows.push({ kind: 'companion', architect, companion });
    }
    for (const session of keyMatches ? architect.sessions : matchingSessions) {
      rows.push({ kind: 'session', architect, session });
    }
  }
  return rows;
}

// A running session reachable by global session cycling.
export interface CycleEntry {
  architectKey: string;
  sessionId: string;
}

// Every running architect, companion and worker session across projects, in the
// unfiltered sidebar order (a search never changes it). Inactive architects and
// companions without a session have no entry: cycling only ever selects, never
// launches.
export function cycleOrder(statuses: ArchitectStatus[]): CycleEntry[] {
  const order: CycleEntry[] = [];
  for (const row of buildRows(statuses, '')) {
    if (row.kind === 'architect') {
      if (row.architect.session_id) {
        order.push({ architectKey: row.architect.key, sessionId: row.architect.session_id });
      }
    } else if (row.kind === 'companion') {
      const sessionId = companionSessionId(row.companion);
      if (sessionId) order.push({ architectKey: row.architect.key, sessionId });
    } else if (row.session.status === 'running') {
      order.push({ architectKey: row.architect.key, sessionId: row.session.id });
    }
  }
  return order;
}

// The session `delta` steps from `currentId`, wrapping at both ends. With no
// current session in the order, forward starts at the first and backward at the
// last. Null when there is nowhere else to go.
export function cycleTarget(
  order: CycleEntry[],
  currentId: string | null,
  delta: 1 | -1,
): CycleEntry | null {
  if (order.length === 0) return null;
  const idx = currentId === null ? -1 : order.findIndex((e) => e.sessionId === currentId);
  const next =
    idx === -1
      ? order[delta > 0 ? 0 : order.length - 1]
      : order[(idx + delta + order.length) % order.length];
  return next.sessionId === currentId ? null : next;
}

// The rail's label for an architect: its first letter or digit.
export function architectInitial(name: string): string {
  const match = name.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : '?';
}
