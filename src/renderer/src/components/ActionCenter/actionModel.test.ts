import { describe, expect, it } from 'vitest';
import {
  decisionRequest,
  isDecidable,
  keepActionNotice,
  parseActionRequired,
  parseActionResolved,
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
