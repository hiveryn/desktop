import { ApiEnvelopeError, Dialog } from '@components';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ApprovalDialog.module.css';

interface ApprovalDialogProps {
  sessionId: string;
  body: string;
  onClose: () => void;
}

export default function ApprovalDialog({ sessionId, body, onClose }: ApprovalDialogProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  async function handleApprove(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await window.hiveryn.sessions.approveConclusion(sessionId);
      onClose();
    } catch (err) {
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
      setError(err);
      setSubmitting(false);
    }
  }

  if (rejecting) {
    return (
      <Dialog
        title="Reject Conclusion"
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
      title="Approve Conclusion"
      confirmLabel="APPROVE"
      cancelLabel="REJECT"
      confirmDisabled={submitting}
      onConfirm={() => void handleApprove()}
      onCancel={() => setRejecting(true)}
    >
      <div className={styles.markdown}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
      {error ? <ApiEnvelopeError error={error} title="Approve API Error" /> : null}
    </Dialog>
  );
}
