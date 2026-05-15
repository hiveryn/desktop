import * as React from 'react';
import { createPortal } from 'react-dom';
import Button from '../Button/Button';
import styles from './SessionConcludedDialog.module.css';

export interface SessionConcludedDialogProps {
  sessionType: 'architect' | 'work';
  conclusionBody: string;
  commits?: string[];
  rejected?: boolean;
  rejectionReason?: string;
  timerSeconds?: number;
  onComplete: () => void;
}

const SessionConcludedDialog: React.FC<SessionConcludedDialogProps> = ({
  sessionType,
  conclusionBody,
  commits = [],
  rejected = false,
  rejectionReason,
  timerSeconds = 10,
  onComplete,
}) => {
  const [remaining, setRemaining] = React.useState(timerSeconds);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    panelRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }
    const id = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, onComplete]);

  const title = sessionType === 'architect' ? 'Session Concluded' : 'Worker Concluded';

  return createPortal(
    <div className={styles.backdrop}>
      <div
        className={[styles.panel, rejected ? styles.rejected : undefined].filter(Boolean).join(' ')}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className={styles.titleBar}>
          <span className={styles.statusDot} />
          <span className={styles.titleText}>{title}</span>
        </div>

        <div className={styles.body}>
          {rejected && (
            <div className={styles.rejectionNotice}>
              <span className={styles.rejectionLabel}>rejected</span>
              {rejectionReason && <span className={styles.rejectionReason}>{rejectionReason}</span>}
            </div>
          )}

          <div className={styles.conclusionBody}>{conclusionBody}</div>

          {commits.length > 0 && (
            <div className={styles.commits}>
              <div className={styles.commitsLabel}>commits</div>
              <div className={styles.commitList}>
                {commits.map(sha => (
                  <span key={sha} className={styles.commitSha}>{sha}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.countdown}>Terminating in {remaining}s...</span>
          <Button intent="destructive" onClick={onComplete}>Terminate Now</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SessionConcludedDialog;
