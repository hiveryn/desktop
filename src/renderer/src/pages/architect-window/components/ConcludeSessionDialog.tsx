import { ApiEnvelopeError, Button, Dialog } from '@components';
import { useState } from 'react';
import type { SessionRecord } from '../../../state/sessionStore';
import styles from './ConcludeSessionDialog.module.css';

interface ConcludeSessionDialogProps {
  session: SessionRecord;
  onClose: () => void;
}

// A daemon 404 means the session was already concluded elsewhere — treat as done.
function isAlreadyResolved(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 404;
}

export default function ConcludeSessionDialog({ session, onClose }: ConcludeSessionDialogProps) {
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  async function conclude(params: {
    body: string;
    rejected: boolean;
    rejectionReason: string;
  }): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await window.hiveryn.sessions.conclude(session.id, {
        body: params.body,
        commits: [],
        rejected: params.rejected,
        rejection_reason: params.rejectionReason,
      });
      onClose();
    } catch (err) {
      if (isAlreadyResolved(err)) {
        onClose();
        return;
      }
      setError(err);
      setSubmitting(false);
    }
  }

  // Ticket sessions can only be concluded manually via rejection — commit
  // auto-detection isn't available in the renderer, so completing-with-commits
  // stays the agent's job. The daemon requires a non-empty rejection reason.
  if (session.type === 'ticket') {
    return (
      <Dialog
        title="Reject Ticket"
        confirmLabel="REJECT"
        confirmDisabled={!reason.trim() || submitting}
        intent="destructive"
        onConfirm={() =>
          void conclude({ body: body.trim(), rejected: true, rejectionReason: reason.trim() })
        }
        onCancel={onClose}
      >
        <textarea
          className={styles.textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this ticket being rejected? (required)"
          rows={3}
        />
        <textarea
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Conclusion summary (optional)…"
          rows={4}
        />
        {error ? <ApiEnvelopeError error={error} title="Conclude API Error" /> : null}
      </Dialog>
    );
  }

  // Architect & freeform sessions: body summary only. Architect additionally
  // supports DISCARD (conclude with an empty body); freeform does not.
  const discardButton =
    session.type === 'architect' ? (
      <Button
        theme="SECONDARY"
        intent="destructive"
        isDisabled={submitting}
        onClick={() => void conclude({ body: '', rejected: false, rejectionReason: '' })}
      >
        DISCARD
      </Button>
    ) : undefined;

  return (
    <Dialog
      title="Conclude Session"
      confirmLabel="CONCLUDE"
      confirmDisabled={!body.trim() || submitting}
      onConfirm={() => void conclude({ body: body.trim(), rejected: false, rejectionReason: '' })}
      onCancel={onClose}
      footerLeft={discardButton}
    >
      <textarea
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Enter conclusion summary…"
        rows={5}
      />
      {error ? <ApiEnvelopeError error={error} title="Conclude API Error" /> : null}
    </Dialog>
  );
}
