import type { ActionDefinition, ActionRun, ActionRunStatus } from '@hiveryn/shared/domain';

// Pure view model for the Actions window: kept free of React and the bridge so
// it can be unit-tested directly.

/** The bottom-bar tab that shows the Actions home (library, launch, history). */
export const HOME_TAB_ID = 'actions-home';

export function statusLabel(status: ActionRunStatus): string {
  switch (status) {
    case 'pending_approval':
      return 'awaiting approval';
    default:
      return status;
  }
}

/**
 * Context for an architect's request that has not started: where it is
 * approved while pending, or that it never ran. Null otherwise.
 */
export function requestNote(run: ActionRun): string | null {
  if (run.trigger !== 'architect' || run.started_at) return null;
  switch (run.status) {
    case 'pending_approval':
      return `Requested by architect ${run.architect_key ?? ''} — approve or deny it in that architect's window, where you also choose the agent variant.`;
    case 'denied':
    case 'failed':
      return 'This request never started.';
    default:
      return null;
  }
}

/** Why an action cannot be launched right now, or null when it can. */
export function launchBlocker(
  action: ActionDefinition | undefined,
  prompt: string,
  profileName: string | null,
): string | null {
  if (!action) return 'Select an action';
  if (!action.valid) return 'This action has an invalid definition';
  if (action.running_execution_id) return 'This action is already running';
  if (!prompt.trim()) return 'Enter a prompt';
  if (!profileName) return 'Select an agent variant';
  return null;
}

/** Executions of one action (or all), newest first. */
export function runsFor(runs: ActionRun[], action: string | null): ActionRun[] {
  const filtered = action ? runs.filter((run) => run.action === action) : runs;
  return [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** The label a running execution's session tab carries. */
export function sessionTabLabel(run: ActionRun | undefined, fallback: string): string {
  return run ? run.action : fallback;
}

/** The action selected by default: the first valid one, else the first. */
export function defaultActionName(actions: ActionDefinition[]): string | null {
  return (actions.find((action) => action.valid) ?? actions[0])?.name ?? null;
}

export function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
