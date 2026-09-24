import type { ActionRun } from '@hiveryn/shared/domain';
import { useEffect, useState } from 'react';
import type { FsEntry } from '../../../../../shared/types';
import Button from '../../../components/Button/Button';
import { formatTimestamp, requestNote, statusLabel } from '../actionsModel';
import styles from './actions.module.css';

interface Props {
  run: ActionRun;
  /** Switch to the execution's live agent session (running executions only). */
  onOpenSession?: (sessionId: string) => void;
  /** Ask to stop a running execution. */
  onCancel?: (run: ActionRun) => void;
}

/**
 * One execution: its request, status, conclusion and delivered artifact
 * folder. Used on the Actions home for any execution (completed ones stay
 * browsable here) and as the `action` context tab of a running session.
 */
export default function ActionRunDetail({ run, onOpenSession, onCancel }: Props) {
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  // The output folder exists only once the execution started; a request that
  // is pending, denied or failed before starting has none.
  const started = Boolean(run.started_at);

  // The artifact listing is reread whenever the execution changes status, so
  // a concluded run shows what was actually delivered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: status is a trigger — the folder is reread when the execution changes state
  useEffect(() => {
    let cancelled = false;
    setEntriesError(null);
    if (!started) {
      setEntries(null);
      return;
    }
    window.hiveryn.fs.listDir(run.output_dir).then(
      (tree) => {
        if (!cancelled) setEntries(tree.entries);
      },
      (error: unknown) => {
        if (!cancelled) {
          setEntries(null);
          setEntriesError(error instanceof Error ? error.message : String(error));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [run.output_dir, run.status, started]);

  const running = run.status === 'running';
  const note = requestNote(run);

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <span className={styles.detailTitle}>{run.action}</span>
        <span className={styles.statusBadge} data-status={run.status}>
          <span className={styles.statusDot} />
          {statusLabel(run.status)}
        </span>
      </div>

      <dl className={styles.fields}>
        <dt>Execution</dt>
        <dd className={styles.mono}>{run.id}</dd>
        {run.trigger === 'architect' ? (
          <>
            <dt>Requested by</dt>
            <dd>architect {run.architect_key}</dd>
            <dt>Requested</dt>
            <dd>{formatTimestamp(run.created_at)}</dd>
          </>
        ) : null}
        <dt>Variant</dt>
        <dd>{run.profile_name || '—'}</dd>
        <dt>Started</dt>
        <dd>{formatTimestamp(run.started_at)}</dd>
        <dt>Ended</dt>
        <dd>{running ? '—' : formatTimestamp(run.ended_at)}</dd>
        <dt>Repository</dt>
        <dd className={styles.mono}>{run.repo_path}</dd>
      </dl>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Prompt</h3>
        <p className={styles.prose}>{run.prompt}</p>
      </section>

      {note ? <p className={styles.muted}>{note}</p> : null}

      {run.status === 'denied' ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Denied</h3>
          <p className={styles.prose}>{run.reason || 'No reason given.'}</p>
        </section>
      ) : null}

      {(run.summary || run.error || running) && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Conclusion</h3>
          {run.summary ? <p className={styles.prose}>{run.summary}</p> : null}
          {run.error ? <p className={styles.errorText}>{run.error}</p> : null}
          {running && !run.summary ? (
            <p className={styles.muted}>
              Running — the agent concludes when the package is delivered.
            </p>
          ) : null}
        </section>
      )}

      {started ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Output folder</h3>
          <p className={styles.mono}>{run.output_dir}</p>
          <div className={styles.buttonRow}>
            <Button
              theme="SECONDARY"
              onClick={() => void window.hiveryn.fs.revealInFinder(run.output_dir)}
            >
              Reveal in Finder
            </Button>
            <Button
              theme="SECONDARY"
              onClick={() => void navigator.clipboard.writeText(run.output_dir)}
            >
              Copy path
            </Button>
          </div>
          {entriesError ? <p className={styles.errorText}>{entriesError}</p> : null}
          {entries && entries.length === 0 ? <p className={styles.muted}>Empty</p> : null}
          {entries && entries.length > 0 ? (
            <ul className={styles.entries}>
              {entries.map((entry) => (
                <li key={entry.name}>
                  <button
                    type="button"
                    className={styles.entryButton}
                    title={`Open ${entry.name}`}
                    onClick={() =>
                      void window.hiveryn.fs.openExternal(`${run.output_dir}/${entry.name}`)
                    }
                  >
                    {entry.name}
                    {entry.kind === 'dir' ? '/' : ''}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {running && (onOpenSession || onCancel) ? (
        <div className={styles.buttonRow}>
          {onOpenSession && run.session_id ? (
            <Button onClick={() => run.session_id && onOpenSession(run.session_id)}>
              Open session
            </Button>
          ) : null}
          {onCancel ? (
            <Button theme="SECONDARY" onClick={() => onCancel(run)}>
              Stop execution
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
