import * as React from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TicketReference } from '@hiveryn/shared/domain';
import type { Ticket, TicketConclusion } from '../KanbanBoard/types';
import styles from './TicketDetail.module.css';

interface TicketDetailProps {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
  onSpawn?: () => void;
  onReference?: (reference: TicketReference) => void;
}

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

const TicketTab: React.FC<{ ticket: Ticket; onReference?: (reference: TicketReference) => void }> = ({ ticket, onReference }) => (
  <>
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
      <span className={styles.fieldLabel}>status</span>
      <span className={styles.fieldValue}>{ticket.status}</span>
      <span className={styles.fieldLabel}>created</span>
      <span className={styles.fieldValue}>{ticket.created ? fmt(ticket.created) : ''}</span>
      <span className={styles.fieldLabel}>updated</span>
      <span className={styles.fieldValue}>{ticket.updated ? fmt(ticket.updated) : ''}</span>
    </div>

    {ticket.warnings.length > 0 && (
      <div className={styles.section}>
        <div className={styles.sectionLabel}>warnings</div>
        <ul className={styles.warningList}>
          {ticket.warnings.map((w, i) => (
            <li key={i} className={styles.warningItem}>
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
            <li key={ref.value} className={styles.refItem} onClick={() => ref.exists && onReference?.(ref)}>
              {ref.type} · {ref.value}{!ref.exists ? ' · missing' : ref.type === 'path' && ref.kind ? ` · ${ref.kind}` : ''}
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
  </>
);

const ConclusionTab: React.FC<{ conclusion: TicketConclusion }> = ({ conclusion }) => (
  <>
    <div className={styles.fieldGrid}>
      <span className={styles.fieldLabel}>agent</span>
      <span className={styles.fieldValue}>{conclusion.agent ?? 'unknown'} / {conclusion.profile ?? 'unknown'}</span>
      <span className={styles.fieldLabel}>concluded</span>
      <span className={styles.fieldValue}>{fmt(conclusion.concluded_at)}</span>
      {conclusion.commits.length > 0 && <>
        <span className={styles.fieldLabel}>commits</span>
        <span className={styles.fieldValue}>
          {conclusion.commits.map((commit) => `${commit.repo}: ${commit.sha}`).join(', ')}
        </span>
      </>}
      {conclusion.outcome === 'rejected' && <>
        <span className={styles.fieldLabel}>rejected</span>
        <span className={[styles.fieldValue, styles.rejected].join(' ')}>
          {conclusion.rejection_reason || 'yes'}
        </span>
      </>}
      {conclusion.outcome === 'exploratory' && <>
        <span className={styles.fieldLabel}>exploratory</span>
        <span className={[styles.fieldValue, styles.exploratory].join(' ')}>
          no commits
        </span>
      </>}
    </div>

    {conclusion.body && (
      <div className={styles.section}>
        <Md>{conclusion.body}</Md>
      </div>
    )}
  </>
);

const TicketDetail: React.FC<TicketDetailProps> = ({ ticket, open, onClose, onSpawn, onReference }) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = React.useState<'ticket' | 'conclusion'>('ticket');

  React.useEffect(() => {
    setActiveTab('ticket');
  }, [ticket.id]);

  React.useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    el.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const hasTabs = ticket.conclusion !== null;

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        className={styles.panel}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ticket.title}
        tabIndex={-1}
      >
        <div className={styles.titleBar}>
          <span className={styles.titleText}>{ticket.title}</span>
          <div className={styles.titleActions}>
            {ticket.status === 'backlog' && onSpawn && (
              <button className={styles.spawnBtn} onClick={onSpawn}>SPAWN</button>
            )}
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">&#x2715;</button>
          </div>
        </div>

        {hasTabs && (
          <div className={styles.tabs} role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'ticket'}
              className={[styles.tab, activeTab === 'ticket' ? styles.tabActive : undefined].filter(Boolean).join(' ')}
              onClick={() => setActiveTab('ticket')}
            >
              Ticket
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'conclusion'}
              className={[styles.tab, activeTab === 'conclusion' ? styles.tabActive : undefined, ticket.conclusion?.outcome === 'rejected' ? styles.tabRejected : undefined, ticket.conclusion?.outcome === 'exploratory' ? styles.tabExploratory : undefined].filter(Boolean).join(' ')}
              onClick={() => setActiveTab('conclusion')}
            >
              {ticket.conclusion?.outcome === 'rejected'
                ? 'Conclusion — Rejected'
                : ticket.conclusion?.outcome === 'exploratory'
                  ? 'Conclusion — Exploratory'
                  : 'Conclusion'}
            </button>
          </div>
        )}

        <div className={styles.body}>
          {(!hasTabs || activeTab === 'ticket') && <TicketTab ticket={ticket} onReference={onReference} />}
          {hasTabs && activeTab === 'conclusion' && ticket.conclusion && (
            <ConclusionTab conclusion={ticket.conclusion} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TicketDetail;
