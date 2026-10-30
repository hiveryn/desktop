import {
  ACTION_REQUEST_RESOLVED,
  type ActionDecisionRequest,
  type ActionOrigin,
  type ActionRequest,
  type ActionRequestStatus,
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

// What a failed decision call tells about the request. Only the daemon's
// recorded outcome is authoritative: a 409 ACTION_REQUEST_RESOLVED carries it
// (details.action) — also for the retry of a decision that won but whose
// response was lost. Anything else — a 404 (Hiveryn no longer knows the
// request), another conflict, a lost or failed response — says nothing about
// whether the action was authorized, and is reported as unknown.
export type DecisionFailure =
  | { kind: 'resolved'; resolution: ActionResolution }
  // The request is no longer decidable here; its outcome is not known.
  | { kind: 'closed'; reason: string }
  // The call itself failed: the decision may or may not have been recorded.
  // A retry is safe — the daemon decides once and answers a retry with the
  // recorded outcome.
  | { kind: 'unknown'; reason: string }
  // The daemon refused this decision as invalid; the request is unchanged.
  | { kind: 'refused' };

interface DecisionError {
  status?: number;
  code?: string;
  details?: unknown;
  message?: string;
}

export function classifyDecisionFailure(err: unknown, actionId: string): DecisionFailure {
  const e = (err ?? {}) as DecisionError;
  const reason = e.message ?? String(err);
  if (e.status === 409 && e.code === ACTION_REQUEST_RESOLVED) {
    const recorded = (e.details as { action?: Record<string, unknown> } | undefined)?.action;
    const status = recorded?.status;
    if (
      recorded &&
      recorded.id === actionId &&
      typeof status === 'string' &&
      status !== 'pending' &&
      STATUSES.includes(status as ActionRequestStatus)
    ) {
      return {
        kind: 'resolved',
        resolution: {
          action_id: actionId,
          status: status as ActionRequestStatus,
          message: typeof recorded.message === 'string' ? recorded.message : undefined,
          reason: typeof recorded.reason === 'string' ? recorded.reason : undefined,
        },
      };
    }
    return { kind: 'closed', reason: `Hiveryn answered without a readable outcome (${reason})` };
  }
  if (e.status === 404) {
    return {
      kind: 'closed',
      reason: 'Hiveryn no longer has a record of this request (for example after a restart)',
    };
  }
  if (e.status === 409) return { kind: 'closed', reason };
  // The daemon refused the decision itself (validation): nothing recorded,
  // the request is still pending.
  if (e.status === 400) return { kind: 'refused' };
  return { kind: 'unknown', reason };
}

// A resolution as shown: one learned from the daemon's record after an
// uncertain or refused decision call says so.
export function recordedMessage(action: ActionRequest & { recorded?: boolean }): string {
  const message = resolutionMessage(action);
  return action.recorded ? `Hiveryn's recorded outcome: ${message}` : message;
}

export function closedMessage(reason: string): string {
  return `No longer decidable here: ${reason}. Its outcome is not known — check the companion's activity log before assuming it was or was not authorized.`;
}

export function unknownMessage(reason: string): string {
  return `The decision's outcome is not known: ${reason}. It may have been recorded. Retrying is safe: Hiveryn records only one decision and answers a retry with the recorded outcome.`;
}
