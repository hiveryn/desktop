import { ApiEnvelopeError, Dialog } from '@components';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PendingApproval } from '../../../state/sessionStore';
import styles from './ApprovalDialog.module.css';

interface ApprovalDialogProps {
  approval: PendingApproval;
  onClose: () => void;
}

function isAlreadyResolved(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 404;
}

export default function ApprovalDialog({ approval, onClose }: ApprovalDialogProps) {
  const { sessionId, body, timeoutSeconds, commits, rejected, rejectionReason } = approval;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [remaining, setRemaining] = useState(timeoutSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      if (!submitting) onClose();
      return;
    }
    const id = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(id);
  }, [remaining, submitting, onClose]);

  async function handleApprove(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await window.hiveryn.sessions.approveConclusion(sessionId);
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

  async function handleReject(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await window.hiveryn.sessions.rejectConclusion(sessionId, reason.trim() || undefined);
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

  const countdown = <span className={styles.countdown}>{remaining}s</span>;

  if (rejecting) {
    return (
      <Dialog
        title={<>Reject Conclusion {countdown}</>}
        confirmLabel="CONFIRM REJECT"
        cancelLabel="BACK"
        confirmDisabled={submitting}
        intent="destructive"
        onConfirm={() => void handleReject()}
        onCancel={() => {
          setRejecting(false);
          setError(null);
        }}
      >
        <textarea
          className={styles.textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason (optional)…"
          rows={3}
        />
        {error ? <ApiEnvelopeError error={error} title="Reject API Error" /> : null}
      </Dialog>
    );
  }

  return (
    <Dialog
      title={<>Approve Conclusion {countdown}</>}
      confirmLabel="APPROVE"
      cancelLabel="REJECT"
      confirmDisabled={submitting}
      onConfirm={() => void handleApprove()}
      onCancel={() => setRejecting(true)}
    >
      {rejected && (
        <div className={styles.rejectedBanner}>
          <span className={styles.rejectedLabel}>Resubmitted after rejection</span>
          {rejectionReason && <span className={styles.rejectedReason}>{rejectionReason}</span>}
        </div>
      )}
      <div className={styles.markdown}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
      {commits.length > 0 && (
        <div className={styles.commits}>
          <div className={styles.commitsLabel}>Commits</div>
          <ul className={styles.commitList}>
            {commits.map((commit) => (
              <li key={`${commit.repo}:${commit.sha}`} className={styles.commit}>
                <span className={styles.commitRepo}>{commit.repo}</span>
                <span className={styles.commitSha}>{commit.sha.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error ? <ApiEnvelopeError error={error} title="Approve API Error" /> : null}
    </Dialog>
  );
}
