import type { WorkerPreflight, Workflow, WorkflowList } from '@hiveryn/shared/domain';

/**
 * The pure selection model behind the ticket launch dialog. Everything here is
 * a function of the daemon's own answers — the workflow listing and the worker
 * preflight — so the desktop decides nothing the daemon would decide
 * differently at launch.
 */

/**
 * The agent variants whose name contains the query, case-insensitively, in the
 * listed order. Names are all the dropdown shows, so they are all it matches.
 */
export function filterAgentNames(names: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q === '') return names;
  return names.filter((name) => name.toLowerCase().includes(q));
}

/**
 * Why a workflow was suggested: the repos it declares that overlap the
 * session's writable scope, e.g. "Matches: core, agent-a". Empty for a
 * workflow that was not suggested.
 */
export function suggestionReason(workflow: Workflow, scopeRepos: string[]): string {
  if (!workflow.suggested) return '';
  const scope = new Set(scopeRepos);
  const matched = workflow.repos.filter((repo) => scope.has(repo));
  if (matched.length === 0) return '';
  return `Matches: ${matched.join(', ')}`;
}

/**
 * A workflow can only be selected when the daemon calls it valid — an invalid
 * one would fail the launch with its own diagnostics, so the dialog keeps it
 * visible and unselectable rather than hiding the problem.
 */
export function isSelectable(workflow: Workflow): boolean {
  return workflow.valid;
}

export interface WorkflowGroups {
  /** Valid, repo-matched, preselected. */
  suggested: Workflow[];
  /** Valid and selectable, but not suggested for this scope — manual ones included. */
  available: Workflow[];
  /** Listed with diagnostics, never selectable. */
  invalid: Workflow[];
}

/**
 * Splits the listing into the three rendered groups, preserving the daemon's
 * order inside each. Workflows are flat and unordered, so grouping is purely
 * about what the user has to decide first.
 */
export function groupWorkflows(list: WorkflowList): WorkflowGroups {
  const groups: WorkflowGroups = { suggested: [], available: [], invalid: [] };
  for (const workflow of list.workflows) {
    if (!isSelectable(workflow)) groups.invalid.push(workflow);
    else if (workflow.suggested) groups.suggested.push(workflow);
    else groups.available.push(workflow);
  }
  return groups;
}

/**
 * The selection a freshly opened dialog starts from: every valid suggestion for
 * this ticket's repo scope, and nothing else. A suggestion is a default, not an
 * obligation — it can be removed, and an empty selection is a valid launch.
 *
 * Recomputed from a fresh listing on every open, so one ticket's selection can
 * never carry into another's launch.
 */
export function initialSelection(list: WorkflowList): string[] {
  return list.workflows
    .filter((workflow) => workflow.suggested && isSelectable(workflow))
    .map((workflow) => workflow.path);
}

/**
 * Carries an existing selection across a refreshed listing.
 *
 * The user's choices win: nothing is added back because it is suggested and
 * nothing is dropped because it stopped being suggested. Only a path that is no
 * longer selectable at all — deleted, renamed, or newly invalid — leaves, since
 * the launch would refuse it anyway. Selection order is preserved.
 */
export function reconcileSelection(previous: string[], list: WorkflowList): string[] {
  const selectable = new Set(list.workflows.filter(isSelectable).map((workflow) => workflow.path));
  return previous.filter((path) => selectable.has(path));
}

/** Toggles one path, keeping the remaining selection's order stable. */
export function toggleSelection(selection: string[], path: string): string[] {
  return selection.includes(path)
    ? selection.filter((selected) => selected !== path)
    : [...selection, path];
}

export interface LaunchGateInput {
  /**
   * The profile the user has chosen, or null when there is no valid visible
   * choice — a remembered preference that no longer matches any listed profile
   * is not a selection.
   */
  profileName: string | null;
  /** The daemon's worker preflight, or null while it has not answered yet. */
  preflight: WorkerPreflight | null;
  /** The workflow listing, or null while it has not answered yet. */
  list: WorkflowList | null;
  selection: string[];
  submitting: boolean;
}

/**
 * Every reason this launch cannot be submitted right now, in the order they
 * should be read. An empty result means Spawn is live.
 *
 * The workspace problems come verbatim from the daemon's preflight: the desktop
 * reports the daemon's verdict rather than forming its own, which is also why
 * the aggregate workspace check is never consulted here.
 */
export function launchBlockers(input: LaunchGateInput): string[] {
  const blockers: string[] = [];
  if (input.submitting) blockers.push('a launch is already in flight');
  if (input.preflight === null) blockers.push('the architect workspace has not been checked yet');
  if (input.list === null) blockers.push('the workflow list has not loaded yet');
  blockers.push(...launchProblems(input));
  if (input.profileName === null) blockers.push('no agent profile is selected');
  return blockers;
}

/**
 * The blockers the user has to act on outside the dialog's own controls: the
 * daemon's preflight problems and selected paths the listing no longer offers.
 * The dialog shows these; the rest (still loading, no agent picked, in flight)
 * already read from the disabled Spawn and the empty agent control, so the
 * normal path stays compact.
 */
export function launchProblems(input: LaunchGateInput): string[] {
  const problems: string[] = [];
  if (input.preflight !== null) problems.push(...input.preflight.problems);
  if (input.list !== null) {
    const selectable = new Set(input.list.workflows.filter(isSelectable).map((w) => w.path));
    for (const path of input.selection) {
      if (!selectable.has(path)) problems.push(`${path} is no longer selectable`);
    }
  }
  return problems;
}

/**
 * The remembered profile, only if it is still one of the listed profiles. A
 * preference that no longer resolves is not silently launched with: the dialog
 * shows no selection and Spawn stays disabled until the user picks one.
 */
export function resolvePreferredProfile(
  preferred: string | null,
  profiles: { name: string }[],
): string | null {
  if (preferred === null) return null;
  return profiles.some((profile) => profile.name === preferred) ? preferred : null;
}

/**
 * A ticket session that exists in the daemon but never got a running run —
 * what a launch that failed between `POST /api/sessions` and
 * `POST /api/sessions/{id}/runs` leaves behind.
 *
 * Finding it is what keeps a retry from creating a second session for the same
 * ticket, and it is the only way such a session becomes visible again: it has
 * no run, so session discovery (which registers running sessions) never shows
 * it.
 *
 * Its stored selection is immutable — the daemon never edits one in place — so
 * the dialog relaunches it as-is. Changing the selection means discarding it
 * and creating a new session, which is the daemon's documented repair path.
 */
export function findRelaunchableSession<
  S extends {
    id: string;
    architect_key: string;
    session_type: string;
    context_id: string;
    workflows: string[];
    current_run?: { status: string };
  },
>(sessions: S[], architectKey: string, ticketId: string): S | null {
  return (
    sessions.find(
      (session) =>
        session.session_type === 'ticket' &&
        session.architect_key === architectKey &&
        session.context_id === ticketId &&
        session.current_run?.status !== 'running',
    ) ?? null
  );
}
