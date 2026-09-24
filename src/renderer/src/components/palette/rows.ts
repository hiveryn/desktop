import type { ArchitectStatus, ArchitectStatusSession } from '../../../../shared/types';

export type PaletteRow =
  | { kind: 'architect'; architect: ArchitectStatus; active: boolean }
  | { kind: 'session'; architect: ArchitectStatus; session: ArchitectStatusSession }
  // Opens the global Actions window; Actions belong to no architect.
  | { kind: 'actions' };

export const ACTIONS_ROW_LABEL = 'Actions';

export function rowKey(row: PaletteRow): string {
  switch (row.kind) {
    case 'architect':
      return `architect:${row.architect.key}`;
    case 'session':
      return `session:${row.session.id}`;
    case 'actions':
      return 'actions';
  }
}

// An architect is active when it has a running architect session (`status`
// is the agent_status of that session, null when none is running) or any
// running worker sessions — not just when worker sessions are present, since
// a freshly-restarted architect may be running with no workers spawned yet.
export function isArchitectActive(architect: ArchitectStatus): boolean {
  return architect.status !== null || architect.sessions.length > 0;
}

export function buildRows(statuses: ArchitectStatus[], query: string): PaletteRow[] {
  const q = query.toLowerCase().trim();
  const active: ArchitectStatus[] = [];
  const inactive: ArchitectStatus[] = [];
  for (const architect of statuses) {
    if (isArchitectActive(architect)) active.push(architect);
    else inactive.push(architect);
  }

  const rows: PaletteRow[] = [];
  for (const architect of [...active, ...inactive]) {
    const isActive = isArchitectActive(architect);
    if (!q) {
      rows.push({ kind: 'architect', architect, active: isActive });
      for (const session of architect.sessions) {
        rows.push({ kind: 'session', architect, session });
      }
      continue;
    }

    const keyMatches = architect.key.toLowerCase().includes(q);
    const matchingSessions = architect.sessions.filter((s) => s.title.toLowerCase().includes(q));
    if (!keyMatches && matchingSessions.length === 0) continue;

    rows.push({ kind: 'architect', architect, active: isActive });
    for (const session of keyMatches ? architect.sessions : matchingSessions) {
      rows.push({ kind: 'session', architect, session });
    }
  }
  if (!q || ACTIONS_ROW_LABEL.toLowerCase().includes(q)) {
    rows.push({ kind: 'actions' });
  }
  return rows;
}
