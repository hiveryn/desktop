import { ApiEnvelopeError, Button, Dialog } from '@components';
import { useState } from 'react';
import styles from './ConcludeSessionDialog.module.css';

interface ConcludeSessionDialogProps {
  sessionId: string;
  onClose: () => void;
}

export default function ConcludeSessionDialog({ sessionId, onClose }: ConcludeSessionDialogProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  async function handleConfirm(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await window.hiveryn.sessions.conclude(sessionId, body.trim());
      onClose();
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  async function handleDiscard(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await window.hiveryn.sessions.conclude(sessionId, '');
      onClose();
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  const discardButton = (
    <Button theme="SECONDARY" intent="destructive" isDisabled={submitting} onClick={() => void handleDiscard()}>
      DISCARD
    </Button>
  );

  return (
    <Dialog
      title="Conclude Session"
      confirmLabel="CONCLUDE"
      confirmDisabled={!body.trim() || submitting}
      onConfirm={() => void handleConfirm()}
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
