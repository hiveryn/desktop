import { describe, expect, it } from 'vitest';
import type { ArchitectStatus } from '../../../../../shared/types';
import { architectInitial, buildRows, cycleOrder, cycleTarget, rowKey } from './rows';

function architect(key: string, overrides: Partial<ArchitectStatus> = {}): ArchitectStatus {
  return {
    key,
    name: key,
    path: `/ws/${key}`,
    status: null,
    session_id: null,
    sessions: [],
    ...overrides,
  };
}

describe('sidebar rows', () => {
  const statuses = [
    architect('idle'),
    architect('busy', {
      status: 'active',
      sessions: [
        {
          id: 's-1',
          title: 'Ship board',
          status: 'running',
          agent_status: 'active',
          started_at: '2026-09-25T00:00:00Z',
        },
      ],
    }),
  ];

  it('lists active architects with their sessions before inactive ones', () => {
    expect(buildRows(statuses, '').map(rowKey)).toEqual([
      'architect:busy',
      'session:s-1',
      'architect:idle',
    ]);
  });

  it('keeps an architect as the header of sessions matching the query', () => {
    expect(buildRows(statuses, 'BOARD').map(rowKey)).toEqual(['architect:busy', 'session:s-1']);
    expect(buildRows(statuses, 'idle').map(rowKey)).toEqual(['architect:idle']);
    expect(buildRows(statuses, 'zzz')).toEqual([]);
  });

  it('offers nothing beyond architects and their sessions', () => {
    expect(buildRows([], '')).toEqual([]);
  });
});

function worker(id: string, title = id) {
  return {
    id,
    title,
    status: 'running' as const,
    agent_status: 'idle',
    started_at: '2026-10-29T00:00:00Z',
  };
}

describe('global session cycling', () => {
  // Configuration order: an inactive architect first, a project whose architect
  // is not running but has a worker, then two running projects.
  const statuses = [
    architect('dormant'),
    architect('orphan', { sessions: [worker('o-1')] }),
    architect('alpha', { status: 'idle', session_id: 'a-arch', sessions: [worker('a-1')] }),
    architect('beta', {
      status: 'active',
      session_id: 'b-arch',
      sessions: [worker('b-1'), { ...worker('b-done'), status: 'completed' }],
    }),
  ];
  const order = cycleOrder(statuses);
  const ids = order.map((e) => e.sessionId);

  it('lists every running session across projects in unfiltered sidebar order', () => {
    expect(ids).toEqual(['o-1', 'a-arch', 'a-1', 'b-arch', 'b-1']);
    expect(order[1]).toEqual({ architectKey: 'alpha', sessionId: 'a-arch' });
  });

  it('steps both ways and wraps at the ends', () => {
    expect(cycleTarget(order, 'a-1', 1)?.sessionId).toBe('b-arch');
    expect(cycleTarget(order, 'a-1', -1)?.sessionId).toBe('a-arch');
    expect(cycleTarget(order, 'b-1', 1)?.sessionId).toBe('o-1');
    expect(cycleTarget(order, 'o-1', -1)?.sessionId).toBe('b-1');
  });

  it('starts at the first (forward) or last (backward) without a current session', () => {
    expect(cycleTarget(order, null, 1)?.sessionId).toBe('o-1');
    expect(cycleTarget(order, null, -1)?.sessionId).toBe('b-1');
    expect(cycleTarget(order, 'ended-meanwhile', 1)?.sessionId).toBe('o-1');
  });

  it('does nothing with no running session or only the current one', () => {
    expect(cycleTarget([], null, 1)).toBeNull();
    const single = cycleOrder([architect('solo', { status: 'idle', session_id: 'only' })]);
    expect(cycleTarget(single, 'only', 1)).toBeNull();
    expect(cycleTarget(single, null, -1)?.sessionId).toBe('only');
  });
});

describe('rail initials', () => {
  it('uses the first letter or digit, upper-cased', () => {
    expect(architectInitial('hiveryn')).toBe('H');
    expect(architectInitial('  _radius')).toBe('R');
    expect(architectInitial('9lives')).toBe('9');
    expect(architectInitial('—')).toBe('?');
  });
});
