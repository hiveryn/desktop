import { ApiEnvelopeError, Dialog } from '@components';
import { useState } from 'react';
import type { CompanionRecoveryTarget } from '../sidebar/SessionSidebar';
import { companionRecovery } from '../sidebar/sidebarModel';
import styles from './ConcludeSessionDialog.module.css';

interface Props {
  target: CompanionRecoveryTarget;
  onClose(): void;
}

// The user's recovery for a companion the daemon could not stop cleanly: a
// retry of confirmed termination (stop_failed) or the removal of a companion
// whose process ended (failed). It is not a conclude: a running companion ends
// only through its architect's shutdown request, and the daemon refuses this
// route for one. Nothing here forces a stop — the daemon confirms termination
// or reports why it could not.
export default function CompanionRecoveryDialog({ target, onClose }: Props) {
  const { companion, architectName } = target;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const recovery = companionRecovery(companion);

  async function recover(): Promise<void> {
    if (!companion.session_id) return;
    setSubmitting(true);
    setError(null);
    try {
      await window.hiveryn.sessions.discard(companion.session_id);
      onClose();
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  const retry = recovery === 'retry-termination';
  const where = companion.machine ? ` on ${companion.machine}` : '';
  return (
    <Dialog
      title={
        retry
          ? `Retry termination · companion ${companion.name}`
          : `Remove ended companion · ${companion.name}`
      }
      confirmLabel={retry ? 'RETRY TERMINATION' : 'REMOVE'}
      confirmDisabled={submitting || recovery === null}
      intent="destructive"
      onConfirm={() => void recover()}
      onCancel={onClose}
    >
      {retry ? (
        <p className={styles.confirmText}>
          Hiveryn could not confirm that companion <strong>{companion.name}</strong> of{' '}
          {architectName} stopped{where}; it may still be running, and it blocks the architect's
          conclusion. Retrying asks the daemon to terminate it again and confirm the result — its
          recorded handoff is kept.
        </p>
      ) : (
        <p className={styles.confirmText}>
          The process of companion <strong>{companion.name}</strong> of {architectName} ended and
          could not be resumed{where}. Removing it confirms termination and clears its session.
        </p>
      )}
      {companion.error ? <p className={styles.confirmText}>Daemon: {companion.error}</p> : null}
      {companion.shutdown ? (
        <p className={styles.confirmText}>
          Shutdown request {companion.shutdown.request_id} · {companion.shutdown.status}
          {companion.shutdown.error ? ` · ${companion.shutdown.error}` : ''}
        </p>
      ) : null}
      {error ? <ApiEnvelopeError error={error} title="Companion recovery error" /> : null}
    </Dialog>
  );
}
