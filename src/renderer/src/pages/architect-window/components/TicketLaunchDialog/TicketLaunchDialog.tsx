import type { AgentProfile } from '@components';
import { ApiEnvelopeError, Dialog } from '@components';
import type {
  TicketSummary,
  WorkerPreflight,
  Workflow,
  WorkflowList,
} from '@hiveryn/shared/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import AgentSelect from './AgentSelect';
import {
  groupWorkflows,
  initialSelection,
  isSelectable,
  launchBlockers,
  launchProblems,
  reconcileSelection,
  resolvePreferredProfile,
  suggestionReason,
  toggleSelection,
} from './launchSelection';
import styles from './TicketLaunchDialog.module.css';

/** Everything the launch needs from a ticket: identity and writable repo scope. */
export type LaunchableTicket = Pick<TicketSummary, 'id' | 'repo' | 'additional_repos'>;

interface TicketLaunchDialogProps {
  architectKey: string;
  ticket: LaunchableTicket;
  profiles: AgentProfile[];
  /**
   * Creates and launches the session. Resolves when the worker is running and
   * rejects with the daemon's error otherwise — the dialog stays open on a
   * rejection with every selection intact.
   */
  onLaunch: (profileName: string, workflows: string[]) => Promise<void>;
  onCancel: () => void;
  /**
   * A session already created for this ticket that never got a running run —
   * a launch that failed after `POST /api/sessions`. Its selection is what the
   * daemon stored and is immutable, so the dialog shows it locked and relaunches
   * it rather than creating a second session.
   */
  existingSession: { id: string; workflows: string[] } | null;
}

// The last profile the user launched with, remembered across dialogs. A view
// preference, so it lives in the renderer rather than on the daemon.
const PROFILE_PREFERENCE_KEY = 'hiveryn.launch.profile';

function readProfilePreference(): string | null {
  try {
    return window.localStorage.getItem(PROFILE_PREFERENCE_KEY);
  } catch {
    // A blocked store costs the preference, never the launch.
    return null;
  }
}

function writeProfilePreference(name: string): void {
  try {
    window.localStorage.setItem(PROFILE_PREFERENCE_KEY, name);
  } catch {
    // Same: the choice is already applied to this launch.
  }
}

/** The ticket's writable repo scope: primary first, then the additional repos. */
function repoScope(ticket: LaunchableTicket): string[] {
  return [ticket.repo ?? '', ...ticket.additional_repos].filter((repo) => repo !== '');
}

/**
 * The one dialog a ticket launch goes through: pick the agent, toggle the
 * workflow chips, then Spawn. Nothing is created until Spawn — opening the
 * dialog, picking an agent and toggling workflows all launch nothing.
 *
 * Deliberately compact and keyboard-complete: focus starts in the agent
 * dropdown, Tab walks agent → chips → Spawn, and Enter only ever acts on what
 * is focused (select an agent, toggle a chip, press Spawn). Everything beyond
 * the controls — load, preflight and launch errors — renders only when present.
 */
export default function TicketLaunchDialog({
  architectKey,
  ticket,
  profiles,
  onLaunch,
  onCancel,
  existingSession,
}: TicketLaunchDialogProps) {
  const [list, setList] = useState<WorkflowList | null>(null);
  const [preflight, setPreflight] = useState<WorkerPreflight | null>(null);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [selection, setSelection] = useState<string[]>(existingSession?.workflows ?? []);
  const [profileName, setProfileName] = useState<string | null>(() =>
    resolvePreferredProfile(readProfilePreference(), profiles),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown | null>(null);

  // The suggestions are computed once per dialog and then belong to the user:
  // the first load seeds the selection, every later load only prunes what the
  // workspace no longer offers.
  const seeded = useRef(existingSession !== null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const scope = repoScope(ticket);
  const scopeKey = scope.join(',');
  // A created session's selection is fixed: the daemon never edits one in
  // place, so the chips stop being a decision and become a record.
  const locked = existingSession !== null;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [workflows, ready] = await Promise.all([
        window.hiveryn.workflows.list(architectKey, scopeKey === '' ? [] : scopeKey.split(',')),
        window.hiveryn.workflows.preflight(architectKey),
      ]);
      setList(workflows);
      setPreflight(ready);
      if (existingSession !== null) {
        // The daemon owns this selection; a refresh may not prune it.
        setSelection(existingSession.workflows);
      } else if (seeded.current) {
        setSelection(reconcileSelection(selectionRef.current, workflows));
      } else {
        seeded.current = true;
        setSelection(initialSelection(workflows));
      }
    } catch (err) {
      setLoadError(err);
    }
  }, [architectKey, scopeKey, existingSession]);

  useEffect(() => {
    void load();
  }, [load]);

  // A launch failure is usually a workspace that moved under the dialog, so
  // reload both answers and show what changed rather than leaving stale rows.
  const submit = useCallback(async () => {
    if (profileName === null || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onLaunch(profileName, selection);
      writeProfilePreference(profileName);
    } catch (err) {
      setSubmitError(err);
      setSubmitting(false);
      void load();
    }
  }, [load, onLaunch, profileName, selection, submitting]);

  const gate = { profileName, preflight, list, selection, submitting };
  const blockers = launchBlockers(gate);
  const problems = launchProblems(gate);
  const groups = list === null ? null : groupWorkflows(list);
  // Suggested first, then the rest, then the ones only a file repair can make
  // selectable: the order the user has to decide in.
  const chips =
    groups === null ? [] : [...groups.suggested, ...groups.available, ...groups.invalid];
  const broken = chips.filter((workflow) => workflow.diagnostics.length > 0);

  const renderChip = (workflow: Workflow) => {
    const path = workflow.path;
    const selected = selection.includes(path);
    const selectable = isSelectable(workflow);
    const reason = suggestionReason(workflow, list?.scope_repos ?? []);
    return (
      <button
        key={path}
        type="button"
        className={[
          styles.chip,
          selected ? styles.chipSelected : undefined,
          selectable ? undefined : styles.chipInvalid,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={selected}
        disabled={!selectable || locked}
        title={reason === '' ? workflow.rel_path : `${workflow.rel_path} · ${reason}`}
        onClick={() => setSelection((prev) => toggleSelection(prev, path))}
      >
        <span className={styles.chipMark} aria-hidden="true">
          {selected ? '✓' : '+'}
        </span>
        {workflow.name}
      </button>
    );
  };

  return (
    <Dialog
      title="SPAWN WORKER"
      confirmLabel={submitting ? 'SPAWNING…' : 'SPAWN'}
      confirmDisabled={blockers.length > 0}
      onConfirm={() => void submit()}
      // Escape and the backdrop still dismiss; there is no Cancel button.
      showCancelButton={false}
      isolateKeys
      onCancel={() => {
        if (!submitting) onCancel();
      }}
    >
      {existingSession !== null && (
        <div className={styles.notice}>
          Relaunching session <code>{existingSession.id}</code>, created earlier but never launched.
          Its workflows are immutable — discard the session to choose others.
        </div>
      )}

      <AgentSelect
        names={profiles.map((profile) => profile.name)}
        selectedName={profileName}
        onSelect={setProfileName}
      />

      <div className={styles.chips}>
        {groups === null && loadError === null && (
          <span className={styles.status}>discovering workflows…</span>
        )}
        {list !== null && list.workflows.length === 0 && (
          <span className={styles.status}>no workflows</span>
        )}
        {chips.map(renderChip)}
      </div>

      {broken.length > 0 && (
        <ul className={styles.diagnostics}>
          {broken.flatMap((workflow) =>
            workflow.diagnostics.map((diagnostic) => (
              <li
                key={`${workflow.path}:${diagnostic.code}:${diagnostic.line}:${diagnostic.message}`}
              >
                <span className={styles.diagnosticCode}>{diagnostic.code}</span>
                {diagnostic.path}
                {diagnostic.line > 0 ? `:${diagnostic.line}` : ''} — {diagnostic.message}
              </li>
            )),
          )}
        </ul>
      )}
      {list !== null && list.diagnostics.length > 0 && (
        <ul className={styles.diagnostics}>
          {list.diagnostics.map((diagnostic) => (
            <li key={`${diagnostic.code}:${diagnostic.message}`}>
              <span className={styles.diagnosticCode}>{diagnostic.code}</span>
              {diagnostic.message}
            </li>
          ))}
        </ul>
      )}

      {loadError !== null && (
        <ApiEnvelopeError error={loadError} title="Workflow Discovery API Error" />
      )}

      {problems.length > 0 && !submitting && (
        <div className={styles.blockers}>
          <div className={styles.blockersLabel}>launch blocked</div>
          <ul className={styles.blockerList}>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {submitError !== null && (
        <ApiEnvelopeError error={submitError} title="Worker Spawn API Error" />
      )}
    </Dialog>
  );
}
