import type { ActionList, ActionRun, LaunchActionResult } from '@hiveryn/shared/domain';
import { useEffect, useMemo, useState } from 'react';
import type { AgentProfile } from '../../../../../shared/types';
import ApiEnvelopeError from '../../../components/ApiEnvelopeError/ApiEnvelopeError';
import Button from '../../../components/Button/Button';
import AgentSelect from '../../architect-window/components/TicketLaunchDialog/AgentSelect';
import { resolvePreferredProfile } from '../../architect-window/components/TicketLaunchDialog/launchSelection';
import { formatTimestamp, launchBlocker, needsInput, runsFor, statusLabel } from '../actionsModel';
import ActionRunDetail from './ActionRunDetail';
import styles from './actions.module.css';

const PROFILE_PREFERENCE_KEY = 'hiveryn.actions.lastProfile';

function readProfilePreference(): string | null {
  try {
    return window.localStorage.getItem(PROFILE_PREFERENCE_KEY);
  } catch {
    return null;
  }
}

function writeProfilePreference(name: string): void {
  try {
    window.localStorage.setItem(PROFILE_PREFERENCE_KEY, name);
  } catch {
    // The choice is already applied to this launch.
  }
}

interface Props {
  list: ActionList | null;
  runs: ActionRun[];
  profiles: AgentProfile[];
  selectedAction: string | null;
  onSelectAction(name: string): void;
  selectedRunId: string | null;
  onSelectRun(id: string | null): void;
  onLaunched(result: LaunchActionResult): void;
  onOpenSession(sessionId: string): void;
  onCancel(run: ActionRun): void;
}

/**
 * The Actions home: the library on the left, the selected action's launch form
 * and execution history in the middle, and the selected execution on the
 * right. A manual launch needs only a prompt and an agent variant; the launch
 * itself is the approval.
 */
export default function ActionsHome({
  list,
  runs,
  profiles,
  selectedAction,
  onSelectAction,
  selectedRunId,
  onSelectRun,
  onLaunched,
  onOpenSession,
  onCancel,
}: Props) {
  const actions = list?.actions ?? [];
  const action = actions.find((candidate) => candidate.name === selectedAction);
  const history = useMemo(() => runsFor(runs, selectedAction), [runs, selectedAction]);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? history[0] ?? null;

  const [prompt, setPrompt] = useState('');
  const [profileName, setProfileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown | null>(null);

  useEffect(() => {
    if (profileName === null && profiles.length > 0) {
      setProfileName(resolvePreferredProfile(readProfilePreference(), profiles));
    }
  }, [profiles, profileName]);

  // A new action starts with a clean form.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedAction is the trigger
  useEffect(() => {
    setPrompt('');
    setSubmitError(null);
  }, [selectedAction]);

  const blocker = launchBlocker(action, prompt, profileName);

  async function launch(): Promise<void> {
    if (blocker || !action || !profileName) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await window.hiveryn.actions.launch(action.name, {
        prompt,
        profile_name: profileName,
      });
      writeProfilePreference(profileName);
      setPrompt('');
      onLaunched(result);
    } catch (error) {
      setSubmitError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.home}>
      <aside className={styles.library}>
        <h2 className={styles.columnTitle}>Actions</h2>
        {list === null ? <p className={styles.muted}>Loading…</p> : null}
        {list !== null && actions.length === 0 ? (
          <p className={styles.muted}>
            No actions found. Add a Git repository with action.yaml and KICKOFF.md under{' '}
            <span className={styles.mono}>{list.root}</span>.
          </p>
        ) : null}
        <ul className={styles.actionList}>
          {actions.map((candidate) => (
            <li key={candidate.name}>
              <button
                type="button"
                className={styles.actionItem}
                data-selected={candidate.name === selectedAction || undefined}
                data-invalid={!candidate.valid || undefined}
                onClick={() => onSelectAction(candidate.name)}
              >
                <span className={styles.actionName}>{candidate.name}</span>
                <span className={styles.actionMeta}>
                  {!candidate.valid ? 'invalid' : candidate.running_execution_id ? 'running' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={styles.middle}>
        {action ? (
          <>
            <div className={styles.section}>
              <h2 className={styles.columnTitle}>{action.name}</h2>
              <p className={styles.prose}>{action.description || '—'}</p>
              <h3 className={styles.sectionTitle}>Delivers</h3>
              <p className={styles.prose}>{action.artifacts || '—'}</p>
              {!action.valid ? (
                <ul className={styles.problems}>
                  {action.problems.map((problem) => (
                    <li key={`${problem.path}:${problem.message}`}>
                      <span className={styles.mono}>{problem.path}</span>: {problem.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <form
              className={styles.launchForm}
              onSubmit={(event) => {
                event.preventDefault();
                void launch();
              }}
            >
              <h3 className={styles.sectionTitle}>Launch</h3>
              <textarea
                className={styles.prompt}
                value={prompt}
                placeholder="What should this execution do?"
                rows={5}
                disabled={!action.valid || submitting}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void launch();
                  }
                }}
              />
              <div className={styles.launchRow}>
                <div className={styles.agentSelect}>
                  <AgentSelect
                    names={profiles.map((profile) => profile.name)}
                    selectedName={profileName}
                    onSelect={setProfileName}
                  />
                </div>
                <Button
                  type="submit"
                  className={styles.launchButton}
                  disabled={blocker !== null || submitting}
                >
                  {submitting ? 'Launching…' : 'Launch'}
                </Button>
              </div>
              {blocker && prompt.trim() ? <p className={styles.muted}>{blocker}</p> : null}
              {action.running_execution_id ? (
                <p className={styles.muted}>
                  Busy: execution{' '}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => onSelectRun(action.running_execution_id ?? null)}
                  >
                    {action.running_execution_id}
                  </button>{' '}
                  is running. One execution of an action runs at a time.
                </p>
              ) : null}
              {submitError ? <ApiEnvelopeError error={submitError} /> : null}
            </form>
          </>
        ) : (
          <p className={styles.muted}>Select an action.</p>
        )}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Executions</h3>
          {history.length === 0 ? <p className={styles.muted}>None yet.</p> : null}
          <ul className={styles.runList}>
            {history.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  className={styles.runItem}
                  data-selected={run.id === selectedRun?.id || undefined}
                  onClick={() => onSelectRun(run.id)}
                >
                  <span className={styles.statusBadge} data-status={run.status}>
                    <span className={styles.statusDot} />
                    {statusLabel(run.status)}
                  </span>
                  {needsInput(run) ? (
                    <span className={styles.statusBadge} data-status="attention">
                      needs input
                    </span>
                  ) : null}
                  <span className={styles.runTime}>{formatTimestamp(run.created_at)}</span>
                  <span className={styles.runSummary}>
                    {run.summary || run.error || run.reason || run.prompt}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.detailColumn}>
        {selectedRun ? (
          <ActionRunDetail run={selectedRun} onOpenSession={onOpenSession} onCancel={onCancel} />
        ) : (
          <p className={styles.muted}>No execution selected.</p>
        )}
      </section>
    </div>
  );
}
