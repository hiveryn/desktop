import type { ActionRun } from '@hiveryn/shared/domain';
import type { ArchitectStatus, ArchitectStatusSession } from '../../../../shared/types';

/** A running execution with the session the Actions window shows it in. */
export type RunningActionRun = ActionRun & { session_id: string };

export type PaletteRow =
  | { kind: 'architect'; architect: ArchitectStatus; active: boolean }
  | { kind: 'session'; architect: ArchitectStatus; session: ArchitectStatusSession }
  // Opens the global Actions window; Actions belong to no architect.
  | { kind: 'actions' }
  // A running execution, listed under the Actions row like an architect's
  // sessions; selecting it lands the Actions window on its session tab.
  | { kind: 'action-run'; run: RunningActionRun };

export const ACTIONS_ROW_LABEL = 'Actions';

export function rowKey(row: PaletteRow): string {
  switch (row.kind) {
    case 'architect':
      return `architect:${row.architect.key}`;
    case 'session':
      return `session:${row.session.id}`;
    case 'actions':
      return 'actions';
    case 'action-run':
      return `action-run:${row.run.id}`;
  }
}

// An architect is active when it has a running architect session (`status`
// is the agent_status of that session, null when none is running) or any
// running worker sessions — not just when worker sessions are present, since
// a freshly-restarted architect may be running with no workers spawned yet.
export function isArchitectActive(architect: ArchitectStatus): boolean {
  return architect.status !== null || architect.sessions.length > 0;
}

/** The executions the palette lists: running ones that have a session to open. */
export function runningActionRuns(runs: ActionRun[]): RunningActionRun[] {
  return runs.filter(
    (run): run is RunningActionRun => run.status === 'running' && Boolean(run.session_id),
  );
}

export function buildRows(
  statuses: ArchitectStatus[],
  query: string,
  actionRuns: RunningActionRun[] = [],
): PaletteRow[] {
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
  // Same shape as an architect and its sessions: matching the Actions label
  // keeps every execution; otherwise the row heads whichever executions match
  // by action name or prompt.
  const actionsMatch = !q || ACTIONS_ROW_LABEL.toLowerCase().includes(q);
  const matchingRuns = actionsMatch
    ? actionRuns
    : actionRuns.filter(
        (run) => run.action.toLowerCase().includes(q) || run.prompt.toLowerCase().includes(q),
      );
  if (actionsMatch || matchingRuns.length > 0) {
    rows.push({ kind: 'actions' });
    for (const run of matchingRuns) rows.push({ kind: 'action-run', run });
  }
  return rows;
}
