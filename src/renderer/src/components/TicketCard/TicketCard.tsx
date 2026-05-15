import * as React from 'react';
import type { TicketSummary } from '../KanbanBoard/types';
import styles from './TicketCard.module.css';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString('en', { month: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${hh}:${mm}`;
}

interface TicketCardProps extends React.HTMLAttributes<HTMLDivElement> {
  ticket: TicketSummary;
  selected?: boolean;
}

const TicketCard: React.FC<TicketCardProps> = ({ ticket, selected, className, ...rest }) => {
  const classes = [styles.root, selected ? styles.selected : undefined, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      <div className={styles.title}>{ticket.title}</div>
      <div className={styles.meta}>
        <span className={styles.repo}>{ticket.repo}</span>
        <span className={styles.time}>{formatTime(ticket.updated)}</span>
      </div>
    </div>
  );
};

export default TicketCard;
