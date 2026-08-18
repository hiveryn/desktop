import type { Ticket, TicketConclusion } from '@hiveryn/shared/domain';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
        {conclusion.agent ?? 'unknown'} / {conclusion.profile ?? 'unknown'}
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
      {conclusion.outcome === 'rejected' && (
        <>
          <span className={styles.fieldLabel}>rejected</span>
          <span className={[styles.fieldValue, styles.rejected].join(' ')}>
            {conclusion.rejection_reason || 'yes'}
          </span>
        </>
      )}
      {conclusion.outcome === 'exploratory' && (
        <>
          <span className={styles.fieldLabel}>exploratory</span>
          <span className={[styles.fieldValue, styles.exploratory].join(' ')}>no commits</span>
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
        <span className={styles.loading}>Failed to load ticket — see error center</span>
      </div>
    );
  }

  if (!ticket) return null;

  // A done ticket concluded as exploratory ("done, no commits") reads distinctly
  // from a completed one — cyan badge, its own label.
  const isExploratory = ticket.status === 'done' && ticket.conclusion?.outcome === 'exploratory';
  const statusClass = isExploratory ? styles.status_exploratory : styles[`status_${ticket.status}`];
  const statusLabel = isExploratory ? 'exploratory' : ticket.status;

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span className={styles.title}>{ticket.title}</span>
        <span className={[styles.statusBadge, statusClass].join(' ')}>
          <span className={styles.statusDot} />
          {statusLabel}
        </span>
      </div>

      <div className={styles.fieldGrid}>
        <span className={styles.fieldLabel}>id</span>
        <span className={styles.fieldValue}>{ticket.id}</span>
        <span className={styles.fieldLabel}>repo</span>
        <span className={styles.fieldValue}>
          {ticket.repo ?? ''}
          {ticket.additional_repos.length > 0 && <span className={styles.repoTag}> primary</span>}
        </span>
        {ticket.additional_repos.length > 0 && (
          <>
            <span className={styles.fieldLabel}>+ repos</span>
            <span className={styles.fieldValue}>{ticket.additional_repos.join(', ')}</span>
          </>
        )}
        <span className={styles.fieldLabel}>created</span>
        <span className={styles.fieldValue}>{ticket.created ? fmt(ticket.created) : ''}</span>
        <span className={styles.fieldLabel}>updated</span>
        <span className={styles.fieldValue}>{ticket.updated ? fmt(ticket.updated) : ''}</span>
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
            {ticket.resolved_references.map((ref) => (
              <li key={ref.value} className={styles.refItem}>
                {ref.type} · {ref.value}
                {!ref.exists
                  ? ' · missing'
                  : ref.type === 'path' && ref.kind
                    ? ` · ${ref.kind}`
                    : ''}
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
