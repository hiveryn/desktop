import type { Intent } from '@hiveryn/shared/domain';

// The verb for what a policy does on expiry; auto-allow never raises a card.
function autoVerb(policy: Intent['policy']): string | null {
  if (policy === 'wait-then-allow') return 'auto-approve';
  if (policy === 'wait-then-deny') return 'auto-deny';
  return null;
}

/**
 * The card's status label: a cosmetic countdown. The daemon's expiry is
 * authoritative, so at zero the card waits for the resolved event.
 */
export function intentStatusLabel(
  intent: Intent,
  remainingSeconds: number,
  resolving = false,
): string {
  if (resolving || remainingSeconds <= 0) return 'resolving…';
  const verb = autoVerb(intent.policy);
  return verb ? `${verb} ${remainingSeconds}s` : `${remainingSeconds}s`;
}

// A failed resolution stays on screen as a notice only while it is fresh: an
// approved operation that failed (remote cleanup not confirmed, a launch error)
// must not vanish with its card, but old backlog replayed on reconnect is not
// news.
const FAILURE_FRESH_MS = 10 * 60 * 1000;

export function keepIntentFailure(outcome: unknown, eventAt: string, now: number): boolean {
  if (outcome !== 'error') return false;
  const at = Date.parse(eventAt);
  return Number.isFinite(at) && now - at <= FAILURE_FRESH_MS;
}

// Whether an answer attempt ended without learning the outcome: the client
// stopped waiting (TIMEOUT) or the daemon reports the intent already resolving
// (409). Either way the operation may still be running; the card waits for
// the daemon's resolved event instead of guessing.
export function outcomeStillPending(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null;
  return e?.code === 'TIMEOUT' || e?.status === 409;
}
