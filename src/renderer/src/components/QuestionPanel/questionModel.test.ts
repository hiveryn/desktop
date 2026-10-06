import type { AgentQuestion } from '@hiveryn/shared/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../state/sessionStore';
import {
  draftAnswer,
  keepResolutionNotice,
  parseQuestionRequired,
  parseQuestionResolved,
  remainingLabel,
  resolutionMessage,
} from './questionModel';

const required = {
  at: '2026-10-06T10:00:00Z',
  raw: {
    question_id: 'q-1',
    question: 'Deploy to staging first?',
    answers: ['Yes, staging first', 'No, straight to prod'],
    recommended_index: 0,
    origin: { architect_key: 'hiveryn', session_id: 's-1', session_type: 'ticket', ticket_id: 't-1' },
    created_at: '2026-10-06T10:00:00Z',
    expires_at: '2026-10-06T11:00:00Z',
  },
};

describe('question events', () => {
  it('parses a required event into a pending question', () => {
    const q = parseQuestionRequired(required);
    expect(q).toMatchObject({
      question_id: 'q-1',
      status: 'pending',
      recommended_index: 0,
      origin: { session_id: 's-1', ticket_id: 't-1' },
    });
  });

  it('rejects malformed events instead of rendering a wrong card', () => {
    expect(() =>
      parseQuestionRequired({ ...required, raw: { ...required.raw, recommended_index: 2 } }),
    ).toThrow(/recommended_index/);
    expect(() =>
      parseQuestionRequired({ ...required, raw: { ...required.raw, answers: 'yes' } }),
    ).toThrow(/answers/);
    expect(() => parseQuestionResolved({ at: required.at, raw: { question_id: 'q-1', status: 'done' } })).toThrow(
      /status/,
    );
  });

  it('keeps a notice only for a fresh resolution the user did not give', () => {
    const now = Date.parse('2026-10-06T11:00:30Z');
    const expired = parseQuestionResolved({ at: '2026-10-06T11:00:00Z', raw: { question_id: 'q-1', status: 'expired' } });
    expect(keepResolutionNotice(expired, '2026-10-06T11:00:00Z', now)).toBe(true);
    // Old backlog replayed on reconnect just disappears.
    expect(keepResolutionNotice(expired, '2026-10-06T09:00:00Z', now)).toBe(false);
    expect(
      keepResolutionNotice({ question_id: 'q-1', status: 'answered', answer: 'x' }, '2026-10-06T11:00:00Z', now),
    ).toBe(false);
  });
});

describe('answer form', () => {
  const q = parseQuestionRequired(required);

  it('preselects nothing, not even the recommendation', () => {
    expect(draftAnswer(q, { choice: null, text: '' })).toBeNull();
    expect(draftAnswer(q, { choice: null, text: '   ' })).toBeNull();
  });

  it('sends the chosen answer, or free text when typed', () => {
    expect(draftAnswer(q, { choice: 1, text: '' })).toBe('No, straight to prod');
    expect(draftAnswer(q, { choice: 1, text: ' staging, then wait ' })).toBe('staging, then wait');
  });

  it('labels expiry and final states', () => {
    expect(remainingLabel('2026-10-06T11:00:00Z', Date.parse('2026-10-06T10:30:00Z'))).toBe('expires in 30 min');
    expect(remainingLabel('2026-10-06T11:00:00Z', Date.parse('2026-10-06T11:00:01Z'))).toBe('expiring…');
    expect(resolutionMessage({ ...q, status: 'expired' })).toMatch(/No longer answerable/);
    expect(resolutionMessage({ ...q, status: 'cancelled', reason: 'the session ended' })).toBe(
      'No longer answerable: the session ended.',
    );
  });
});

describe('question store', () => {
  const question: AgentQuestion = parseQuestionRequired(required);

  beforeEach(() => useSessionStore.getState().reset());

  it('replayed required+resolved nets to nothing; a fresh notice stays until dismissed', () => {
    const store = useSessionStore.getState();
    store.setQuestion(question);
    store.resolveQuestion({ question_id: 'q-1', status: 'expired' }, false);
    expect(useSessionStore.getState().questions).toEqual({});

    store.setQuestion(question);
    store.resolveQuestion({ question_id: 'q-1', status: 'expired', reason: 'nobody answered' }, true);
    expect(useSessionStore.getState().questions['q-1']?.status).toBe('expired');
    store.dismissQuestion('q-1');
    expect(useSessionStore.getState().questions).toEqual({});
  });

  it('never dismisses a pending question; hiding only minimizes it', () => {
    const store = useSessionStore.getState();
    store.setQuestion(question);
    store.dismissQuestion('q-1');
    store.setQuestionMinimized('q-1', true);
    expect(useSessionStore.getState().questions['q-1']).toMatchObject({ status: 'pending', minimized: true });
  });

  it('drops a session’s questions when the session goes away', () => {
    const store = useSessionStore.getState();
    store.registerSession({ id: 's-1', type: 'ticket', label: 't', contextId: 't-1', mainTerminalId: 'm', tabs: [] });
    store.setQuestion(question);
    store.unregisterSession('s-1');
    expect(useSessionStore.getState().questions).toEqual({});
  });
});
