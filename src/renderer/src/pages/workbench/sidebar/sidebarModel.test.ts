import type { AgentQuestion, Intent } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  agentStatusIndicator,
  architectIndicator,
  needsAttention,
  workerIndicator,
} from './sidebarModel';

describe('status indicators', () => {
  it('gives every agent status a distinct icon and label', () => {
    const kinds = ['active', 'idle', 'waiting', 'stopped', undefined].map(
      (status) => agentStatusIndicator(status).kind,
    );
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(agentStatusIndicator('waiting').label).toMatch(/waiting/i);
  });

  it('shows an architect without a running session as inactive', () => {
    expect(architectIndicator(false, null).kind).toBe('inactive');
    expect(architectIndicator(true, 'idle').kind).toBe('idle');
  });

  it('shows a remote connection problem instead of the stale status', () => {
    expect(workerIndicator('active', 'ka', 'disconnected').kind).toBe('disconnected');
    expect(workerIndicator('active', 'ka', 'missing').kind).toBe('missing');
    const connected = workerIndicator('active', 'ka', 'connected');
    expect(connected.kind).toBe('active');
    expect(connected.label).toContain('ka');
    expect(workerIndicator('idle', undefined, undefined).label).not.toContain(' on ');
  });
});

describe('attention', () => {
  const intent = { intent_id: 'i1', origin: { session_id: 's1' } } as unknown as Intent;
  const question = {
    question_id: 'q1',
    status: 'pending',
    origin: { session_id: 's2' },
  } as unknown as AgentQuestion;

  it('flags sessions with pending intents or questions unless shown', () => {
    const intents = { i1: intent };
    const questions = { q1: question };
    expect(needsAttention('s1', null, intents, questions)).toBe(true);
    expect(needsAttention('s2', 's1', intents, questions)).toBe(true);
    expect(needsAttention('s1', 's1', intents, questions)).toBe(false);
    expect(needsAttention('s3', null, intents, questions)).toBe(false);
  });

  it('ignores resolved question notices', () => {
    const notice = { ...question, status: 'expired' } as AgentQuestion;
    expect(needsAttention('s2', null, {}, { q1: notice })).toBe(false);
  });
});
