import { describe, expect, it } from 'vitest';
import type { ArchitectStatus } from '../../../../../shared/types';
import { buildRows, rowKey } from './rows';

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
