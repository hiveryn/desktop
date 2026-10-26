import type { Intent } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import { intentStatusLabel, keepIntentFailure, outcomeStillPending } from './intentCardModel';

function intent(overrides: Partial<Intent>): Intent {
  return {
    intent_id: 'i-1',
    intent_type: 'spawnTicketWorker',
    summary: '',
    origin: { architect_key: 'hiveryn', session_id: 's-1', session_type: 'architect' },
    wait_seconds: 20,
    policy: 'wait-then-allow',
    created_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

describe('intentStatusLabel', () => {
  it('counts down by policy and then waits for the daemon', () => {
    expect(intentStatusLabel(intent({}), 12)).toBe('auto-approve 12s');
    expect(intentStatusLabel(intent({ policy: 'wait-then-deny' }), 3)).toBe('auto-deny 3s');
    expect(intentStatusLabel(intent({}), 0)).toBe('resolving…');
  });

  it('labels a resolving intent regardless of its countdown', () => {
    expect(intentStatusLabel(intent({}), 15, true)).toBe('resolving…');
    expect(intentStatusLabel(intent({}), 15)).toBe('auto-approve 15s');
  });
});

describe('intent resolution', () => {
  it('treats a client timeout or a 409 as an outcome still on its way, not a failure', () => {
    expect(outcomeStillPending({ code: 'TIMEOUT' })).toBe(true);
    expect(outcomeStillPending({ status: 409, code: 'CONFLICT' })).toBe(true);
    expect(outcomeStillPending({ status: 500, code: 'INTERNAL' })).toBe(false);
    expect(outcomeStillPending({ status: 404 })).toBe(false);
  });

  it('keeps only fresh error resolutions as notices', () => {
    const now = Date.parse('2026-10-09T06:10:00Z');
    expect(keepIntentFailure('error', '2026-10-09T06:09:00Z', now)).toBe(true);
    expect(keepIntentFailure('error', '2026-10-09T05:00:00Z', now)).toBe(false);
    expect(keepIntentFailure('approved', '2026-10-09T06:09:00Z', now)).toBe(false);
    expect(keepIntentFailure('denied_by_user', '2026-10-09T06:09:00Z', now)).toBe(false);
  });
});
