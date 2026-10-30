import type { ActionRequest, AgentQuestion, Companion, Intent } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  agentStatusIndicator,
  architectIndicator,
  companionIndicator,
  companionNeedsDecision,
  companionRecovery,
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

describe('companion indicators', () => {
  const base: Companion = {
    architect_key: 'p',
    architect_session_id: 'arch',
    name: 'browser',
    repo: 'chrome',
    workdir: '/r',
    variant: 'claude',
    machine: 'ka',
    session_id: 'c-1',
    status: 'running',
    agent_status: 'idle',
    connection: 'connected',
    created_at: '',
    updated_at: '',
    pending_actions: [],
  };

  it('shows the lifecycle, and the live status and connection only while running', () => {
    expect(companionIndicator(base).kind).toBe('idle');
    expect(companionIndicator(base, { status: 'active' }).kind).toBe('active');
    expect(companionIndicator(base, { connection: 'disconnected' }).kind).toBe('disconnected');
    expect(
      companionIndicator({ ...base, status: 'stop_failed', error: 'ssh down' }).label,
    ).toContain('ssh down');
    const statuses = [
      'starting',
      'shutdown_requested',
      'stopping',
      'stopped',
      'stop_failed',
      'start_failed',
      'failed',
    ] as const;
    const kinds = statuses.map((status) => companionIndicator({ ...base, status }).kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('offers recovery only for unconfirmed termination or an ended process', () => {
    expect(companionRecovery(base)).toBeNull();
    expect(companionRecovery({ ...base, status: 'shutdown_requested' })).toBeNull();
    expect(companionRecovery({ ...base, status: 'stop_failed' })).toBe('retry-termination');
    expect(companionRecovery({ ...base, status: 'failed' })).toBe('remove');
    expect(
      companionRecovery({ ...base, status: 'start_failed', session_id: undefined }),
    ).toBeNull();
  });

  it('needs a decision for a pending action request', () => {
    const action: ActionRequest = {
      id: 'a1',
      title: 't',
      description: 'd',
      origin: { architect_key: 'p', session_id: 'c-1', session_type: 'companion' },
      status: 'pending',
      created_at: '',
      expires_at: '',
    };
    expect(companionNeedsDecision(base, {}, true)).toBe(false);
    expect(companionNeedsDecision(base, { a1: action }, true)).toBe(true);
    expect(companionNeedsDecision(base, { a1: { ...action, status: 'expired' } }, true)).toBe(
      false,
    );
    // An unopened project: the polled listing.
    expect(companionNeedsDecision({ ...base, pending_actions: [action] }, {}, false)).toBe(true);
  });
});
