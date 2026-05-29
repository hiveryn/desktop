import { ApiEnvelopeError } from '@components';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Ticket, TicketConclusion } from '../../../../../shared/types';
import styles from './TicketPane.module.css';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const Md: React.FC<{ children: string }> = ({ children }) => (
  <div className={styles.markdown}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
  </div>
);

const ConclusionSection: React.FC<{ conclusion: TicketConclusion }> = ({ conclusion }) => (
  <div className={styles.section}>
    <div className={styles.sectionLabel}>conclusion</div>
    <div className={styles.fieldGrid}>
      <span className={styles.fieldLabel}>agent</span>
      <span className={styles.fieldValue}>
        {conclusion.agent} / {conclusion.profile}
      </span>
      <span className={styles.fieldLabel}>concluded</span>
      <span className={styles.fieldValue}>{fmt(conclusion.concluded_at)}</span>
      {conclusion.commits.length > 0 && (
        <>
          <span className={styles.fieldLabel}>commits</span>
          <span className={styles.fieldValue}>
            {conclusion.commits.map((c) => `${c.repo}: ${c.sha}`).join(', ')}
          </span>
        </>
      )}
      {conclusion.rejected && (
        <>
          <span className={styles.fieldLabel}>rejected</span>
          <span className={[styles.fieldValue, styles.rejected].join(' ')}>
            {conclusion.rejection_reason || 'yes'}
          </span>
        </>
      )}
    </div>
    {conclusion.body && <Md>{conclusion.body}</Md>}
  </div>
);

interface Props {
  sessionId: string;
}

export default function TicketPane({ sessionId }: Props) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTicket(null);
    setError(null);
    setLoading(true);

    window.hiveryn.sessions.getTicket(sessionId).then(
      (t) => {
        setTicket(t);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
  }, [sessionId]);

  if (loading) {
    return (
      <div className={styles.pane}>
        <span className={styles.loading}>loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pane}>
        <ApiEnvelopeError error={error} title="Ticket API Error" />
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span className={styles.title}>{ticket.title}</span>
        <span className={[styles.statusBadge, styles[`status_${ticket.status}`]].join(' ')}>
          <span className={styles.statusDot} />
          {ticket.status}
        </span>
      </div>

      <div className={styles.fieldGrid}>
        <span className={styles.fieldLabel}>id</span>
        <span className={styles.fieldValue}>{ticket.id}</span>
        <span className={styles.fieldLabel}>repo</span>
        <span className={styles.fieldValue}>{ticket.repo}</span>
        <span className={styles.fieldLabel}>created</span>
        <span className={styles.fieldValue}>{fmt(ticket.created)}</span>
        <span className={styles.fieldLabel}>updated</span>
        <span className={styles.fieldValue}>{fmt(ticket.updated)}</span>
      </div>

      {ticket.warnings.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>warnings</div>
          <ul className={styles.warningList}>
            {ticket.warnings.map((w) => (
              <li key={w.code} className={styles.warningItem}>
                <span className={styles.warningCode}>{w.code}</span>
                <span className={styles.warningMessage}>{w.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ticket.references.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>references</div>
          <ul className={styles.refList}>
            {ticket.references.map((ref) => (
              <li key={ref} className={styles.refItem}>
                {ref}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ticket.body && (
        <div className={styles.section}>
          <Md>{ticket.body}</Md>
        </div>
      )}

      {ticket.conclusion && <ConclusionSection conclusion={ticket.conclusion} />}
    </div>
  );
}
