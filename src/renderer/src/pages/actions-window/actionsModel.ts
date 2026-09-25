import type {
  ActionAgentAttention,
  ActionDefinition,
  ActionRun,
  ActionRunStatus,
} from '@hiveryn/shared/domain';

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
 * Who requested an agent-requested execution: the architect, or the worker
 * and its ticket. Null for manual launches.
 */
export function requesterLabel(run: ActionRun): string | null {
  const architect = `architect ${run.architect_key ?? ''}`;
  switch (run.trigger) {
    case 'architect':
      return architect;
    case 'worker':
      return `worker on ticket ${run.requester_ticket_id || 'unknown'} (${architect})`;
    default:
      return null;
  }
}

/**
 * Context for an agent's request that has not started: where it is approved
 * while pending, or that it never ran. Null otherwise.
 */
export function requestNote(run: ActionRun): string | null {
  const requester = requesterLabel(run);
  if (!requester || run.started_at) return null;
  switch (run.status) {
    case 'pending_approval':
      return `Requested by ${requester} — approve or deny it in architect ${run.architect_key ?? ''}'s window, where you also choose the agent variant.`;
    case 'denied':
    case 'failed':
      return 'This request never started.';
    default:
      return null;
  }
}

/**
 * The prompt a running execution's agent is known to be waiting on, or null.
 * Only an explicit provider signal counts; the execution itself stays running.
 */
export function needsInput(run: ActionRun): ActionAgentAttention | null {
  return run.status === 'running' && run.attention?.state === 'input_required'
    ? run.attention
    : null;
}

/**
 * A note on a running execution's agent attention when it cannot be
 * observed at all, stated so it never reads as "not waiting". Null when the
 * execution is not running, input is required (see needsInput), or no prompt
 * was detected — the routine state of a working agent, which gets no notice
 * (and no claim that the agent is definitely not waiting).
 */
export function attentionNote(run: ActionRun): string | null {
  if (run.status !== 'running' || needsInput(run)) return null;
  if (!run.attention || run.attention.state === 'unavailable') {
    return 'Whether the agent is waiting for input is unknown: its terminal is not live. Open the session to check.';
  }
  return null;
}

/** The state of an execution's output-folder listing. */
export interface ArtifactListing {
  entries: readonly unknown[] | null;
  error: string | null;
  loading: boolean;
}

/**
 * What the output folder's listing says instead of entries, keeping loading,
 * an empty folder and a read error distinguishable. Null when entries are
 * listed. An empty folder of a running execution is not final — the agent
 * may still write — so it reads "not yet", never a bare "Empty".
 */
export function artifactListingNote(
  listing: ArtifactListing,
  running: boolean,
): { kind: 'error' | 'muted'; text: string } | null {
  if (listing.error) {
    return { kind: 'error', text: `Could not read the output folder: ${listing.error}` };
  }
  if (!listing.entries)
    return listing.loading ? { kind: 'muted', text: 'Loading artifacts…' } : null;
  if (listing.entries.length > 0) return null;
  return {
    kind: 'muted',
    text: running ? 'No artifacts listed yet' : 'No artifacts in the folder',
  };
}

/** Where an input_required signal came from, in words. */
export function attentionSourceLabel(attention: ActionAgentAttention): string {
  return attention.source === 'terminal' ? 'its terminal screen' : "the agent's hooks";
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

/**
 * How many executions the selected action's history lists. A presentation
 * limit only: history is fetched and retained in full, and running-session
 * discovery does not depend on it.
 */
export const LISTED_RUNS_LIMIT = 10;

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
