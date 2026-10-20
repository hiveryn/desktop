import type { ActionArtifactCopy, ActionRun } from '@hiveryn/shared/domain';
import Button from '../../../components/Button/Button';
import {
  artifactStateLabel,
  attentionNote,
  attentionSourceLabel,
  formatTimestamp,
  locationLabel,
  needsInput,
  requesterLabel,
  requestNote,
  revealable,
  statusLabel,
} from '../actionsModel';
import styles from './actions.module.css';

interface Props {
  run: ActionRun;
  /** Switch to the execution's live agent session (running executions only). */
  onOpenSession?: (sessionId: string) => void;
  /** Ask to stop a running execution. */
  onCancel?: (run: ActionRun) => void;
}

/**
 * A path the user can take elsewhere: copied always, revealed in Finder only
 * when it is on this Mac. Never listed.
 */
function PathActions({ path, local }: { path: string; local: boolean }) {
  return (
    <div className={styles.buttonRow}>
      {local ? (
        <Button theme="SECONDARY" onClick={() => void window.hiveryn.finder.reveal(path)}>
          Reveal in Finder
        </Button>
      ) : null}
      <Button theme="SECONDARY" onClick={() => void navigator.clipboard.writeText(path)}>
        Copy path
      </Button>
    </div>
  );
}

/** One managed artifact directory: where it is, its state and why. */
function ArtifactCopy({ title, copy }: { title: string; copy: ActionArtifactCopy }) {
  return (
    <section className={styles.section} data-testid="action-artifact">
      <h3 className={styles.sectionTitle}>
        {title} · {locationLabel(copy.machine)}
      </h3>
      <p className={styles.mono}>{copy.path}</p>
      <p className={styles.muted}>
        {artifactStateLabel(copy)}
        {/* A package that predates frozen packages has no recorded size. */}
        {copy.files > 0
          ? ` · ${copy.files} file${copy.files === 1 ? '' : 's'}, ${copy.bytes} bytes`
          : ''}
      </p>
      {copy.error ? <p className={styles.errorText}>{copy.error}</p> : null}
      {copy.cleanup_error ? (
        <p className={styles.errorText}>
          Removal failed (retried when the daemon next starts): {copy.cleanup_error}
        </p>
      ) : null}
      {copy.state === 'ready' ? <PathActions path={copy.path} local={revealable(copy)} /> : null}
    </section>
  );
}

/**
 * One execution: its request, where it runs, status, conclusion, its frozen
 * package and the copies delivered to callers on other machines (each
 * revealed in Finder when it is on this Mac, or its path copied — never
 * listed). Used on the Actions home for any execution (completed ones stay
 * reachable here) and as the `action` context tab of a running session.
 */
export default function ActionRunDetail({ run, onOpenSession, onCancel }: Props) {
  // The output folder exists only once the execution started; a request that
  // is pending, denied or failed before starting has none.
  const started = Boolean(run.started_at);

  const running = run.status === 'running';
  const note = requestNote(run);
  const requester = requesterLabel(run);
  const input = needsInput(run);
  const noAttention = attentionNote(run);

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
        {requester ? (
          <>
            <dt>Requested by</dt>
            <dd>{requester}</dd>
            <dt>Requested</dt>
            <dd>{formatTimestamp(run.created_at)}</dd>
          </>
        ) : null}
        <dt>Runs on</dt>
        <dd>{locationLabel(run.machine)}</dd>
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

      {input ? (
        <section className={styles.attention} data-testid="action-attention">
          <h3 className={styles.sectionTitle}>Needs your input</h3>
          <p className={styles.prose}>{input.message}</p>
          <p className={styles.muted}>
            Detected {formatTimestamp(input.since)} from {attentionSourceLabel(input)}. The
            execution keeps running until you answer in its terminal.
          </p>
          {onOpenSession && run.session_id ? (
            <div className={styles.buttonRow}>
              <Button onClick={() => run.session_id && onOpenSession(run.session_id)}>
                Open terminal
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {noAttention ? <p className={styles.muted}>{noAttention}</p> : null}

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
              Running — the agent concludes when the requested work is finished.
            </p>
          ) : null}
        </section>
      )}

      {run.package ? (
        <ArtifactCopy
          title={run.status === 'failed' ? 'Partial artifacts' : 'Package'}
          copy={run.package}
        />
      ) : run.status === 'completed' ? (
        <p className={styles.muted}>
          {(run.artifact_mode ?? (run.artifact_contract ? 'required' : 'none')) === 'required'
            ? 'Expected artifact package is missing.'
            : 'Completed without artifacts.'}
        </p>
      ) : run.status === 'failed' ? (
        <p className={styles.muted}>No artifacts delivered.</p>
      ) : null}
      {(run.deliveries ?? []).map((copy) => (
        <ArtifactCopy key={copy.machine ?? ''} title="Delivered copy" copy={copy} />
      ))}

      {started && run.output_dir ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Working folder · {locationLabel(run.machine)}</h3>
          <p className={styles.mono}>{run.output_dir}</p>
          {run.delivery_dir && run.delivery_dir !== run.output_dir ? (
            <p className={styles.muted}>
              Delivered from <span className={styles.mono}>{run.delivery_dir}</span>
            </p>
          ) : null}
          <PathActions path={run.output_dir} local={!run.machine} />
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
