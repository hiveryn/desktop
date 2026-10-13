import type { PathReference, TicketReference } from '@hiveryn/shared/domain';
import type * as React from 'react';
import Button from '../Button/Button';
import { referenceLabel, referenceView } from './referenceModel';
import styles from './TicketDetail.module.css';

export interface ReferenceHandlers {
  onOpenTicket?: (id: string) => void;
  onRevealPath?: (reference: PathReference) => void;
}

/**
 * One resolved reference. Ticket IDs open the ticket; paths stay read-only
 * pointers — copied always, revealed in Finder only when the daemon confirmed
 * them present on this Mac, never for another or an unknown machine.
 */
export const ReferenceItem: React.FC<{ reference: TicketReference } & ReferenceHandlers> = ({
  reference,
  onOpenTicket,
  onRevealPath,
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
      {reference.type === 'path' && (
        <span className={styles.refActions}>
          {view.revealable && onRevealPath && (
            <Button theme="SECONDARY" onClick={() => onRevealPath(reference)}>
              Reveal in Finder
            </Button>
          )}
          <Button theme="SECONDARY" onClick={() => void navigator.clipboard.writeText(reference.value)}>
            Copy path
          </Button>
        </span>
      )}
      {view.error && <div className={styles.refError}>{view.error}</div>}
    </li>
  );
};
