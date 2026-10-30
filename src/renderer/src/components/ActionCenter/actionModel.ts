import type {
  ActionDecisionRequest,
  ActionOrigin,
  ActionRequest,
  ActionRequestStatus,
} from '@hiveryn/shared/domain';
import type { ActionResolution } from '../../state/sessionStore';

// Pure model for companion action requests (requestAction): parsing the
// daemon's session events and the decision form's rules. The daemon authors
// these events (sessionruntime actions.go), so a malformed one is a bug and
// throws. Only the daemon resolves a request: the desktop never decides on
// expiry or treats a stale request as decidable.

interface ActionEvent {
  raw?: Record<string, unknown>;
  at: string;
}

const STATUSES: readonly ActionRequestStatus[] = [
  'pending',
  'accepted',
  'denied',
  'replied',
  'expired',
  'cancelled',
  'interrupted',
];

function requireString(raw: Record<string, unknown>, field: string, event: ActionEvent): string {
  const value = raw[field];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`action_request event missing raw.${field}: ${JSON.stringify(event)}`);
  }
  return value;
}

function parseOrigin(value: unknown, event: ActionEvent): ActionOrigin {
  if (!value || typeof value !== 'object') {
    throw new Error(`action_request event missing raw.origin: ${JSON.stringify(event)}`);
  }
  const o = value as Record<string, unknown>;
  if (
    typeof o.architect_key !== 'string' ||
    typeof o.session_id !== 'string' ||
    typeof o.session_type !== 'string'
  ) {
    throw new Error(`action_request event has malformed raw.origin: ${JSON.stringify(event)}`);
  }
  return {
    architect_key: o.architect_key,
    architect_session_id:
      typeof o.architect_session_id === 'string' ? o.architect_session_id : undefined,
    session_id: o.session_id,
    session_type: o.session_type as ActionOrigin['session_type'],
    companion: typeof o.companion === 'string' ? o.companion : undefined,
  };
}

export function parseActionRequired(event: ActionEvent): ActionRequest {
  const raw = event.raw ?? {};
  return {
    id: requireString(raw, 'action_id', event),
    title: requireString(raw, 'title', event),
    description: requireString(raw, 'description', event),
    origin: parseOrigin(raw.origin, event),
    status: 'pending',
    created_at: requireString(raw, 'created_at', event),
    expires_at: requireString(raw, 'expires_at', event),
  };
}

export function parseActionResolved(event: ActionEvent): ActionResolution {
  const raw = event.raw ?? {};
  const status = raw.status;
  if (
    typeof status !== 'string' ||
    status === 'pending' ||
    !STATUSES.includes(status as ActionRequestStatus)
  ) {
    throw new Error(`action_request/resolved event has unknown raw.status: ${JSON.stringify(event)}`);
  }
  return {
    action_id: requireString(raw, 'action_id', event),
    status: status as ActionRequestStatus,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
  };
}

// A resolution stays on screen as a notice only when the user did not make it
// (expired, withdrawn, interrupted) and it is fresh — not old backlog
// replayed on reconnect.
const NOTICE_FRESH_MS = 2 * 60 * 1000;

export function keepActionNotice(
  resolution: ActionResolution,
  eventAt: string,
  now: number,
): boolean {
  if (
    resolution.status === 'accepted' ||
    resolution.status === 'denied' ||
    resolution.status === 'replied'
  ) {
    return false;
  }
  const at = Date.parse(eventAt);
  return Number.isFinite(at) && now - at <= NOTICE_FRESH_MS;
}

// Whether the request can still be decided here. Past its expiry it is not,
// even before the daemon's resolution arrives: the daemon expires it and an
// expired request can no longer authorize the action.
export function isDecidable(action: ActionRequest, now: number): boolean {
  if (action.status !== 'pending') return false;
  const expires = Date.parse(action.expires_at);
  return Number.isFinite(expires) && expires > now;
}

// The decision a form submits; null while incomplete (a reply needs text).
export function decisionRequest(
  decision: ActionDecisionRequest['decision'],
  replyText: string,
): ActionDecisionRequest | null {
  if (decision !== 'reply') return { decision };
  const message = replyText.trim();
  return message ? { decision, message } : null;
}

export function originLabel(origin: ActionOrigin): string {
  return `${origin.architect_key} · ${origin.companion ?? origin.session_type}`;
}

export function remainingLabel(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'expired — waiting for Hiveryn to close it';
  const minutes = Math.ceil(ms / 60_000);
  return minutes <= 1 ? 'expires in under a minute' : `expires in ${minutes} min`;
}

export function resolutionMessage(action: ActionRequest): string {
  switch (action.status) {
    case 'expired':
      return 'No longer decidable: nobody decided within 1 hour. Nothing was authorized; the companion was told to submit a new request.';
    case 'cancelled':
      return `No longer decidable: ${action.reason ?? 'the request was withdrawn'}. Nothing was authorized.`;
    case 'interrupted':
      return `No longer decidable: ${action.reason ?? 'Hiveryn stopped'}. Nothing was authorized.`;
    case 'accepted':
      return 'Accepted.';
    case 'denied':
      return 'Denied.';
    case 'replied':
      return `Replied: ${action.message ?? ''}`;
    default:
      return '';
  }
}
