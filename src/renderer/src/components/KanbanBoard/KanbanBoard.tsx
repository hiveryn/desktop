import * as React from 'react';
import KanbanColumn from '../KanbanColumn/KanbanColumn';
import TicketCard from '../TicketCard/TicketCard';
import type { TicketBoard, TicketSummary } from './types';
import styles from './KanbanBoard.module.css';

export type { TicketBoard, TicketSummary };

interface KanbanBoardProps extends React.HTMLAttributes<HTMLDivElement> {
  board: TicketBoard;
  onTicketSelect?: (ticket: TicketSummary) => void;
  selectedTicketId?: string | null;
  // Index of the currently focused column (0=backlog, 1=progress, 2=done).
  // When set, the column's header is highlighted.
  focusedColumn?: number | null;
  loading?: boolean;
  emptyMessage?: string;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  board,
  onTicketSelect,
  selectedTicketId = null,
  focusedColumn = null,
  loading = false,
  emptyMessage = 'No tickets',
  className,
  ...rest
}) => {
  const activeCardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    activeCardRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedTicketId]);

  if (loading) {
    return (
      <div className={[styles.state, className].filter(Boolean).join(' ')} {...rest}>
        <span className={styles.stateText}>Loading…</span>
      </div>
    );
  }

  const isEmpty = board.backlog.length === 0 && board.progress.length === 0 && board.done.length === 0;

  if (isEmpty) {
    return (
      <div className={[styles.state, className].filter(Boolean).join(' ')} {...rest}>
        <span className={styles.stateText}>{emptyMessage}</span>
      </div>
    );
  }

  const classes = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      <KanbanColumn title="Backlog" count={board.backlog.length} focused={focusedColumn === 0}>
        {board.backlog.map(t => (
          <TicketCard
            key={t.id}
            ticket={t}
            selected={t.id === selectedTicketId}
            ref={t.id === selectedTicketId ? activeCardRef : undefined}
            onClick={() => onTicketSelect?.(t)}
          />
        ))}
      </KanbanColumn>
      <KanbanColumn title="In Progress" count={board.progress.length} accent="warning" focused={focusedColumn === 1}>
        {board.progress.map(t => (
          <TicketCard
            key={t.id}
            ticket={t}
            selected={t.id === selectedTicketId}
            ref={t.id === selectedTicketId ? activeCardRef : undefined}
            onClick={() => onTicketSelect?.(t)}
          />
        ))}
      </KanbanColumn>
      <KanbanColumn title="Done" count={board.done.length} accent="success" focused={focusedColumn === 2}>
        {board.done.map(t => (
          <TicketCard
            key={t.id}
            ticket={t}
            selected={t.id === selectedTicketId}
            ref={t.id === selectedTicketId ? activeCardRef : undefined}
            onClick={() => onTicketSelect?.(t)}
          />
        ))}
      </KanbanColumn>
    </div>
  );
};

export default KanbanBoard;
