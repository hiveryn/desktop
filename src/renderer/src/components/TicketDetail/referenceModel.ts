import type { PathReference, TicketReference } from '@hiveryn/shared/domain';

/**
 * How one resolved ticket reference is shown. Path references are display-only
 * pointers inspected by the daemon on the ticket's primary-repo machine.
 */
export interface ReferenceView {
  /** Short state shown after the value: kind, missing, unverified. */
  state: string;
  /** Where a path reference lives; null for ticket-ID references. */
  where: string | null;
  /** Why a path could not be inspected, verbatim from the daemon. */
  error: string | null;
  /** A ticket-ID reference that resolves to a ticket on this board. */
  openable: boolean;
}

/** Where a path reference was interpreted. Unknown is never this Mac. */
export function pathLocationLabel(ref: PathReference): string {
  switch (ref.location) {
    case 'local':
      return 'this Mac';
    case 'remote':
      return ref.machine ? `machine ${ref.machine}` : 'a remote machine (unnamed by the daemon)';
    case 'unknown':
      return 'unknown machine';
    default:
      return `unrecognized location "${String(ref.location)}"`;
  }
}

function pathState(ref: PathReference): { state: string; error: string | null } {
  switch (ref.status) {
    case 'present':
      return { state: ref.kind ?? 'present', error: null };
    case 'missing':
      return { state: 'missing', error: null };
    case 'unverified':
      return { state: 'unverified', error: ref.error ?? 'the daemon gave no reason' };
    default:
      // A daemon that predates inspection status: say so rather than guess.
      return {
        state: 'unverified',
        error: `the daemon reported no inspection status (status: ${String(ref.status)})`,
      };
  }
}

export function referenceView(ref: TicketReference): ReferenceView {
  if (ref.type === 'ticket') {
    return {
      state: ref.exists ? '' : 'missing',
      where: null,
      error: null,
      openable: ref.exists,
    };
  }
  return {
    ...pathState(ref),
    where: pathLocationLabel(ref),
    openable: false,
  };
}

/** One-line text for a reference: `type · value · state · on where`. */
export function referenceLabel(ref: TicketReference): string {
  const view = referenceView(ref);
  return [ref.type, ref.value, view.state, view.where ? `on ${view.where}` : '']
    .filter(Boolean)
    .join(' · ');
}
