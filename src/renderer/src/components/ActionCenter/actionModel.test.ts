import { describe, expect, it } from 'vitest';
import {
  classifyDecisionFailure,
  closedMessage,
  decisionRequest,
  isDecidable,
  keepActionNotice,
  parseActionRequired,
  parseActionResolved,
  recordedMessage,
  resolutionMessage,
  unknownMessage,
} from './actionModel';

const origin = {
  architect_key: 'p',
  architect_session_id: 'arch',
  session_id: 'c-1',
  session_type: 'companion',
  companion: 'browser',
};

describe('action request events', () => {
  it('parses a required event strictly', () => {
    const raw = {
      action_id: 'a1',
      title: 'Push',
      description: 'Push **main**',
      origin,
      created_at: '2026-10-30T00:00:00Z',
      expires_at: '2026-10-30T01:00:00Z',
    };
    const action = parseActionRequired({ raw, at: '2026-10-30T00:00:00Z' });
    expect(action).toMatchObject({ id: 'a1', status: 'pending', description: 'Push **main**' });
    expect(action.origin.companion).toBe('browser');
    expect(() => parseActionRequired({ raw: { ...raw, title: '' }, at: '' })).toThrow(/title/);
    expect(() => parseActionRequired({ raw: { ...raw, origin: {} }, at: '' })).toThrow(/origin/);
  });

  it('parses a resolved event and rejects unknown statuses', () => {
    expect(
      parseActionResolved({
        raw: { action_id: 'a1', status: 'cancelled', reason: 'shutdown' },
        at: '',
      }),
    ).toEqual({ action_id: 'a1', status: 'cancelled', message: undefined, reason: 'shutdown' });
    expect(() => parseActionResolved({ raw: { action_id: 'a1', status: 'pending' }, at: '' })).toThrow();
    expect(() => parseActionResolved({ raw: { action_id: 'a1', status: 'odd' }, at: '' })).toThrow();
  });

  it('keeps a fresh resolution the user did not make as a notice', () => {
    const now = Date.parse('2026-10-30T00:01:00Z');
    const at = '2026-10-30T00:00:30Z';
    expect(keepActionNotice({ action_id: 'a', status: 'expired' }, at, now)).toBe(true);
    expect(keepActionNotice({ action_id: 'a', status: 'cancelled' }, at, now)).toBe(true);
    expect(keepActionNotice({ action_id: 'a', status: 'accepted' }, at, now)).toBe(false);
    expect(keepActionNotice({ action_id: 'a', status: 'expired' }, '2026-10-29T00:00:00Z', now)).toBe(
      false,
    );
  });
});

describe('decisions', () => {
  const action = parseActionRequired({
    raw: {
      action_id: 'a1',
      title: 't',
      description: 'd',
      origin,
      created_at: '2026-10-30T00:00:00Z',
      expires_at: '2026-10-30T01:00:00Z',
    },
    at: '',
  });

  it('is not decidable past its expiry or once resolved', () => {
    expect(isDecidable(action, Date.parse('2026-10-30T00:30:00Z'))).toBe(true);
    expect(isDecidable(action, Date.parse('2026-10-30T01:00:00Z'))).toBe(false);
    expect(isDecidable({ ...action, status: 'cancelled' }, Date.parse('2026-10-30T00:30:00Z'))).toBe(
      false,
    );
  });

  it('requires a message for a reply', () => {
    expect(decisionRequest('accept', 'ignored')).toEqual({ decision: 'accept' });
    expect(decisionRequest('reply', '  ')).toBeNull();
    expect(decisionRequest('reply', ' Use XYZ ')).toEqual({ decision: 'reply', message: 'Use XYZ' });
  });
});

// The error shape the preload's invoke throws for a daemon envelope error.
function daemonError(status: number, code: string, message: string, details?: unknown) {
  return Object.assign(new Error(message), { status, code, details });
}

describe('decision failures', () => {
  const recorded = (status: string, extra: Record<string, unknown> = {}) =>
    daemonError(409, 'ACTION_REQUEST_RESOLVED', `no longer decidable: it was already ${status}`, {
      action: { id: 'a1', status, ...extra },
    });

  it('takes the recorded outcome of a retry after an accept whose response was lost', () => {
    expect(classifyDecisionFailure(recorded('accepted'), 'a1')).toEqual({
      kind: 'resolved',
      resolution: { action_id: 'a1', status: 'accepted', message: undefined, reason: undefined },
    });
    expect(classifyDecisionFailure(recorded('replied', { message: 'Use XYZ' }), 'a1')).toMatchObject({
      kind: 'resolved',
      resolution: { status: 'replied', message: 'Use XYZ' },
    });
  });

  it('takes expired and cancelled outcomes from the record, with their reasons', () => {
    expect(classifyDecisionFailure(recorded('expired'), 'a1')).toMatchObject({
      kind: 'resolved',
      resolution: { status: 'expired' },
    });
    expect(
      classifyDecisionFailure(recorded('cancelled', { reason: 'shutdown requested' }), 'a1'),
    ).toMatchObject({ kind: 'resolved', resolution: { status: 'cancelled', reason: 'shutdown requested' } });
  });

  it('never infers an outcome it was not given', () => {
    // A record for another request, a pending or unknown status.
    expect(classifyDecisionFailure(recorded('accepted'), 'other').kind).toBe('closed');
    expect(classifyDecisionFailure(recorded('pending'), 'a1').kind).toBe('closed');
    expect(classifyDecisionFailure(recorded('odd'), 'a1').kind).toBe('closed');
    // Unknown to its session (e.g. after a restart) and an unexplained conflict.
    expect(classifyDecisionFailure(daemonError(404, 'NOT_FOUND', 'action request a1 not found'), 'a1').kind).toBe(
      'closed',
    );
    expect(classifyDecisionFailure(daemonError(409, 'CONFLICT', 'busy'), 'a1')).toEqual({
      kind: 'closed',
      reason: 'busy',
    });
    // The response was lost: timeout, unreachable daemon, server error.
    for (const err of [
      daemonError(0, 'TIMEOUT', 'The daemon did not answer within 30s'),
      daemonError(0, 'NETWORK_ERROR', 'fetch failed'),
      daemonError(500, 'INTERNAL', 'boom'),
      new Error('Error invoking remote method'),
    ]) {
      expect(classifyDecisionFailure(err, 'a1').kind).toBe('unknown');
    }
    expect(classifyDecisionFailure(daemonError(400, 'VALIDATION', 'message is required'), 'a1').kind).toBe(
      'refused',
    );
  });

  it('reports unknown outcomes as unknown, never as not authorized', () => {
    for (const text of [closedMessage('Hiveryn no longer has a record'), unknownMessage('timeout')]) {
      expect(text).not.toMatch(/nothing was authorized/i);
      expect(text).toMatch(/not known/);
    }
  });

  it('labels an outcome learned from the record', () => {
    const base = parseActionRequired({
      raw: {
        action_id: 'a1',
        title: 'Push',
        description: 'd',
        origin,
        created_at: '2026-10-30T00:00:00Z',
        expires_at: '2026-10-30T01:00:00Z',
      },
      at: '',
    });
    expect(recordedMessage({ ...base, status: 'accepted', recorded: true })).toBe(
      "Hiveryn's recorded outcome: Accepted.",
    );
    expect(recordedMessage({ ...base, status: 'accepted' })).toBe(resolutionMessage({ ...base, status: 'accepted' }));
  });
});
