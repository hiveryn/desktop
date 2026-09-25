import type { ActionRun } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import { buildRows, rowKey, runningActionRuns } from './rows';

function run(id: string, overrides: Partial<ActionRun> = {}): ActionRun {
  return {
    id,
    action: 'summarize',
    trigger: 'manual',
    status: 'running',
    prompt: 'summarize the week',
    profile_name: 'claude',
    repo_path: '/repo',
    output_dir: '/out',
    session_id: `session-${id}`,
    created_at: '2026-09-25T00:00:00Z',
    started_at: '2026-09-25T00:00:00Z',
    ...overrides,
  };
}

describe('palette actions row', () => {
  it('always offers the Actions window and filters it by query', () => {
    expect(buildRows([], '').map(rowKey)).toEqual(['actions']);
    expect(buildRows([], 'act').map(rowKey)).toEqual(['actions']);
    expect(buildRows([], 'zzz')).toEqual([]);
  });
});

describe('palette running action rows', () => {
  const runs = runningActionRuns([
    run('a', { action: 'summarize' }),
    run('b', { action: 'triage', prompt: 'open issues' }),
  ]);

  it('lists running executions under the Actions row', () => {
    expect(buildRows([], '', runs).map(rowKey)).toEqual([
      'actions',
      'action-run:a',
      'action-run:b',
    ]);
  });

  it('keeps every execution when the query matches the Actions label', () => {
    expect(buildRows([], 'actions', runs).map(rowKey)).toEqual([
      'actions',
      'action-run:a',
      'action-run:b',
    ]);
  });

  it('keeps the Actions row as a header for executions matching by name or prompt', () => {
    expect(buildRows([], 'triage', runs).map(rowKey)).toEqual(['actions', 'action-run:b']);
    expect(buildRows([], 'ISSUES', runs).map(rowKey)).toEqual(['actions', 'action-run:b']);
    expect(buildRows([], 'zzz', runs)).toEqual([]);
  });

  it('only lists running executions that have a session', () => {
    const listed = runningActionRuns([
      run('running'),
      run('done', { status: 'completed' }),
      run('pending', { status: 'pending_approval', session_id: undefined }),
      run('sessionless', { session_id: undefined }),
    ]);
    expect(listed.map((r) => r.id)).toEqual(['running']);
  });
});
