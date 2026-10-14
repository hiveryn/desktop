import type { TicketReference } from '@hiveryn/shared/domain';
import type * as React from 'react';
import { referenceLabel, referenceView } from './referenceModel';
import styles from './TicketDetail.module.css';

export interface ReferenceHandlers {
  onOpenTicket?: (id: string) => void;
}

/**
 * One resolved reference. Ticket IDs open the ticket; paths are display-only
 * text with their inspection status, location and any inspection error.
 */
export const ReferenceItem: React.FC<{ reference: TicketReference } & ReferenceHandlers> = ({
  reference,
  onOpenTicket,
}) => {
  const view = referenceView(reference);
  const label = referenceLabel(reference);
  return (
    <li className={styles.refItem} data-status={reference.type === 'path' ? reference.status : undefined}>
      {view.openable && onOpenTicket ? (
        <button type="button" className={styles.refLink} onClick={() => onOpenTicket(reference.value)}>
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {view.error && <div className={styles.refError}>{view.error}</div>}
    </li>
  );
};
