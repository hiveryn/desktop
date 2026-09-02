import { TicketCard } from '@components';
import type { RoadmapItem, RoadmapTicketInfo, TicketSummary } from '@hiveryn/shared/domain';
import styles from './RoadmapDetail.module.css';

interface Props {
  item: RoadmapItem;
  items: RoadmapItem[];
  tickets: RoadmapTicketInfo[];
  onSelectItem(id: string): void;
  onOpenTicket(ticketId: string): void;
}

function statusLabel(status: string): string {
  return status.replace('_', ' ');
}

// TicketCard (the same card the Kanban board renders) expects a full
// TicketSummary; roadmap evidence is deliberately a smaller, compact shape
// (shared/domain/roadmap.ts's RoadmapTicketInfo). Fields TicketCard doesn't
// read (created/updated/references/warnings) default to empty/absent.
function toTicketSummary(ticket: RoadmapTicketInfo): TicketSummary {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    repo: ticket.repo,
    additional_repos: ticket.additional_repos,
    references: [],
    resolved_references: [],
    has_conclusion: ticket.has_conclusion,
    warnings: [],
  };
}

export default function RoadmapDetail({ item, items, tickets, onSelectItem, onOpenTicket }: Props) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.kindBadge} data-kind={item.kind}>
          {item.kind}
        </span>
        <span className={styles.statusBadge} data-status={item.status}>
          {statusLabel(item.status)}
        </span>
      </div>
      <h2 className={styles.title}>{item.title}</h2>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>outcome</div>
        <p className={styles.outcome}>{item.outcome}</p>
      </div>

      {item.success_criteria.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>success criteria</div>
          <ul className={styles.list}>
            {item.success_criteria.map((criterion, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: plain text criteria, no stable id
              <li key={i}>{criterion}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionLabel}>dependencies</div>
        {item.depends_on.length === 0 ? (
          <span className={styles.muted}>none</span>
        ) : (
          <ul className={styles.list}>
            {item.depends_on.map((depId) => {
              const dep = itemById.get(depId);
              return (
                <li key={depId}>
                  {dep ? (
                    <button
                      type="button"
                      className={styles.linkRow}
                      onClick={() => onSelectItem(depId)}
                    >
                      <span
                        className={styles.statusDot}
                        data-status={dep.status}
                        aria-hidden="true"
                      />
                      {dep.title}
                    </button>
                  ) : (
                    <span className={styles.missing}>{depId} — not in this view</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>linked tickets ({item.tickets.length})</div>
        {item.tickets.length === 0 ? (
          <span className={styles.muted}>
            none — ticket state is evidence, not a completion signal
          </span>
        ) : (
          <div className={styles.ticketList}>
            {item.tickets.map((ticketId) => {
              const ticket = ticketById.get(ticketId);
              if (!ticket) {
                return (
                  <div key={ticketId} className={styles.ticketCard}>
                    <div className={styles.missingTicket}>{ticketId} — not found</div>
                  </div>
                );
              }
              return (
                <div key={ticketId} className={styles.ticketCard}>
                  <TicketCard
                    ticket={toTicketSummary(ticket)}
                    onClick={() => onOpenTicket(ticket.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
