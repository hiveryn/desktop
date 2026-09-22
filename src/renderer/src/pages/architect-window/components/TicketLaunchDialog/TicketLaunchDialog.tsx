import type { AgentProfile } from '@components';
import { ApiEnvelopeError, Dialog, ProfileList } from '@components';
import type {
  TicketSummary,
  WorkerPreflight,
  Workflow,
  WorkflowList,
} from '@hiveryn/shared/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  groupWorkflows,
  initialSelection,
  launchBlockers,
  reconcileSelection,
  resolvePreferredProfile,
  suggestionReason,
  toggleSelection,
  workflowFileName,
  workflowLabel,
} from './launchSelection';
import styles from './TicketLaunchDialog.module.css';

/** Everything the launch needs from a ticket: identity and writable repo scope. */
export type LaunchableTicket = Pick<TicketSummary, 'id' | 'title' | 'repo' | 'additional_repos'>;

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

interface PreviewState {
  loading: boolean;
  text?: string;
  error?: unknown;
}

/**
 * The one dialog a ticket launch goes through: pick the agent, confirm the
 * workflow selection, then Spawn. Nothing is created until Spawn — opening the
 * dialog, picking a profile and ticking workflows all launch nothing.
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
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [expanded, setExpanded] = useState<string[]>([]);

  // The suggestions are computed once per dialog and then belong to the user:
  // the first load seeds the selection, every later load only prunes what the
  // workspace no longer offers.
  const seeded = useRef(existingSession !== null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const scope = repoScope(ticket);
  const scopeKey = scope.join(',');
  // A created session's selection is fixed: the daemon never edits one in
  // place, so the checkboxes stop being a decision and become a record.
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

  const togglePreview = useCallback((workflow: Workflow) => {
    const path = workflow.path;
    setExpanded((prev) =>
      prev.includes(path) ? prev.filter((open) => open !== path) : [...prev, path],
    );
    setPreviews((prev) => {
      if (prev[path]) return prev;
      void (async () => {
        try {
          // Read through the daemon: the desktop never touches a daemon-local
          // path itself, and the preview is always the file as it is now.
          const file = await window.hiveryn.fs.readFile(path);
          const text = new TextDecoder().decode(file.bytes);
          setPreviews((current) => ({ ...current, [path]: { loading: false, text } }));
        } catch (err) {
          setPreviews((current) => ({ ...current, [path]: { loading: false, error: err } }));
        }
      })();
      return { ...prev, [path]: { loading: true } };
    });
  }, []);

  const blockers = launchBlockers({ profileName, preflight, list, selection, submitting });
  const groups = list === null ? null : groupWorkflows(list);

  const renderRow = (workflow: Workflow, selectable: boolean) => {
    const path = workflow.path;
    const checked = selection.includes(path);
    const isOpen = expanded.includes(path);
    const preview = previews[path];
    const reason = suggestionReason(workflow, list?.scope_repos ?? []);
    return (
      <li key={path} className={styles.workflowRow}>
        <div className={styles.workflowHead}>
          <label
            className={selectable && !locked ? styles.workflowLabel : styles.workflowLabelDisabled}
          >
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={checked}
              disabled={!selectable || locked}
              onChange={() => setSelection((prev) => toggleSelection(prev, path))}
            />
            <span className={styles.workflowName}>{workflowLabel(workflow)}</span>
            <span className={styles.workflowFile}>{workflowFileName(workflow)}</span>
          </label>
          <button
            type="button"
            className={styles.previewToggle}
            onClick={() => togglePreview(workflow)}
            aria-expanded={isOpen}
          >
            {isOpen ? '▾ preview' : '▸ preview'}
          </button>
        </div>
        {reason !== '' && <div className={styles.workflowReason}>{reason}</div>}
        {workflow.diagnostics.length > 0 && (
          <ul className={styles.diagnostics}>
            {workflow.diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.code}:${diagnostic.line}:${diagnostic.message}`}>
                <span className={styles.diagnosticCode}>{diagnostic.code}</span>
                {diagnostic.path}
                {diagnostic.line > 0 ? `:${diagnostic.line}` : ''} — {diagnostic.message}
              </li>
            ))}
          </ul>
        )}
        {isOpen && (
          <div className={styles.preview}>
            {preview?.loading && <div className={styles.previewStatus}>reading…</div>}
            {preview?.error !== undefined && (
              <ApiEnvelopeError error={preview.error} title="Workflow Preview API Error" />
            )}
            {preview?.text !== undefined && (
              <div className={styles.markdown}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.text}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  const section = (label: string, hint: string, workflows: Workflow[], selectable: boolean) =>
    workflows.length === 0 ? null : (
      <div className={styles.workflowGroup}>
        <div className={styles.groupLabel}>
          {label}
          <span className={styles.groupHint}>{hint}</span>
        </div>
        <ul className={styles.workflowList}>
          {workflows.map((workflow) => renderRow(workflow, selectable))}
        </ul>
      </div>
    );

  return (
    <Dialog
      title={`LAUNCH WORKER · ${ticket.id}`}
      confirmLabel={submitting ? 'SPAWNING…' : 'SPAWN'}
      confirmDisabled={blockers.length > 0}
      onConfirm={() => void submit()}
      onCancel={() => {
        if (!submitting) onCancel();
      }}
    >
      <div className={styles.ticketTitle}>{ticket.title}</div>

      {existingSession !== null && (
        <div className={styles.notice}>
          Session <code>{existingSession.id}</code> was already created for this ticket and never
          launched. Spawn relaunches it with the selection it was created with — selections are
          immutable, so changing them means discarding that session and creating a new one.
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionLabel}>agent</div>
        <div className={styles.profileBox}>
          <ProfileList
            profiles={profiles}
            selectedName={profileName}
            onChoose={setProfileName}
            autoFocus={false}
          />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>
          workflows
          <span className={styles.groupHint}>
            {scope.length === 0 ? 'no repo scope' : `scope: ${scope.join(', ')}`}
          </span>
          <button type="button" className={styles.refresh} onClick={() => void load()}>
            refresh
          </button>
        </div>
        {loadError !== null && (
          <ApiEnvelopeError error={loadError} title="Workflow Discovery API Error" />
        )}
        {groups === null && loadError === null && (
          <div className={styles.status}>discovering workflows…</div>
        )}
        {groups !== null && list !== null && list.workflows.length === 0 && (
          <div className={styles.status}>
            this workspace has no workflows — launching with none is valid
          </div>
        )}
        {groups !== null && (
          <>
            {section('suggested', 'matched this ticket’s repos', groups.suggested, true)}
            {section('available', 'add by hand', groups.available, true)}
            {section('invalid', 'repair the file to select it', groups.invalid, false)}
          </>
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
      </div>

      {blockers.length > 0 && !submitting && (
        <div className={styles.blockers}>
          <div className={styles.sectionLabel}>launch blocked</div>
          <ul className={styles.blockerList}>
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
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
