import type { TicketReference } from '@hiveryn/shared/domain';

/**
 * How one resolved ticket reference is shown. Architect and repo references
 * are display-only pointers the daemon inspected where they live: the
 * architect workspace on the daemon host, a repo on its configured machine.
 */
export interface ReferenceView {
  /** What the reference addresses: ticket, architect workspace, repo <key>, or invalid. */
  owner: string;
  /** Short state shown after the value: kind, missing, unverified, invalid. */
  state: string;
  /** Where the target lives; null for ticket and invalid references. */
  where: string | null;
  /** The worker MCP tool that reads it; null when there is none. */
  access: string | null;
  /** Why it is invalid or could not be inspected, verbatim from the daemon. */
  error: string | null;
  /** A ticket-ID reference that resolves to a ticket on this board. */
  openable: boolean;
}

/** Where a reference's target lives. Unknown is never this Mac. */
export function referenceLocationLabel(ref: TicketReference): string {
  switch (ref.location) {
    case 'local':
      return 'this Mac';
    case 'remote':
      return ref.machine ? `machine ${ref.machine}` : 'a remote machine (unnamed by the daemon)';
    default:
      return 'unknown machine';
  }
}

function ownerLabel(ref: TicketReference): string {
  switch (ref.kind) {
    case 'ticket':
      return 'ticket';
    case 'architect':
      return 'architect workspace';
    case 'repo':
      return `repo ${ref.owner ?? '(unnamed)'}`;
    default:
      return 'invalid';
  }
}

function stateOf(ref: TicketReference): { state: string; error: string | null } {
  switch (ref.status) {
    case 'present':
      return { state: ref.kind === 'ticket' ? '' : (ref.path_kind ?? 'present'), error: null };
    case 'missing':
      return { state: 'missing', error: null };
    case 'unverified':
      return { state: 'unverified', error: ref.error ?? 'the daemon gave no reason' };
    case 'invalid':
      return { state: 'invalid', error: ref.error ?? 'the daemon gave no reason' };
  }
}

export function referenceView(ref: TicketReference): ReferenceView {
  const { state, error } = stateOf(ref);
  const located = (ref.kind === 'architect' || ref.kind === 'repo') && ref.status !== 'invalid';
  return {
    owner: ownerLabel(ref),
    state,
    where: located ? referenceLocationLabel(ref) : null,
    access: ref.status === 'invalid' ? null : (ref.access ?? null),
    error,
    openable: ref.kind === 'ticket' && ref.status === 'present',
  };
}

/** One-line text for a reference: `owner · value · state · on where · via access`. */
export function referenceLabel(ref: TicketReference): string {
  const view = referenceView(ref);
  return [
    view.owner,
    ref.value,
    view.state,
    view.where ? `on ${view.where}` : '',
    view.access && ref.kind !== 'ticket' ? `via ${view.access}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
