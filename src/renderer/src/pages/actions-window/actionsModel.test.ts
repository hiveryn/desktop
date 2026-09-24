import type { ActionDefinition, ActionRun } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import { defaultActionName, launchBlocker, runsFor, sessionTabLabel } from './actionsModel';

const action = (overrides: Partial<ActionDefinition> = {}): ActionDefinition => ({
  name: 'demo-evidence',
  path: '/home/.hiveryn/actions/demo-evidence',
  description: 'd',
  artifacts: 'a',
  valid: true,
  problems: [],
  ...overrides,
});

const run = (id: string, name: string, created: string): ActionRun => ({
  id,
  action: name,
  trigger: 'manual',
  status: 'completed',
  prompt: 'p',
  profile_name: 'codex',
  repo_path: '/repo',
  output_dir: `/out/${id}`,
  created_at: created,
});

describe('launchBlocker', () => {
  it('explains every reason a launch is not possible', () => {
    expect(launchBlocker(undefined, 'x', 'codex')).toBe('Select an action');
    expect(launchBlocker(action({ valid: false }), 'x', 'codex')).toMatch(/invalid/);
    expect(launchBlocker(action({ running_execution_id: 'r1' }), 'x', 'codex')).toMatch(
      /already running/,
    );
    expect(launchBlocker(action(), '   ', 'codex')).toBe('Enter a prompt');
    expect(launchBlocker(action(), 'x', null)).toBe('Select an agent variant');
    expect(launchBlocker(action(), 'Run AMS and LDN', 'codex')).toBeNull();
  });
});

describe('runsFor', () => {
  it('filters by action and sorts newest first', () => {
    const runs = [
      run('a', 'demo', '2026-09-24T08:00:00Z'),
      run('b', 'other', '2026-09-24T09:00:00Z'),
      run('c', 'demo', '2026-09-24T10:00:00Z'),
    ];
    expect(runsFor(runs, 'demo').map((r) => r.id)).toEqual(['c', 'a']);
    expect(runsFor(runs, null).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('defaultActionName / sessionTabLabel', () => {
  it('prefers a valid action and labels tabs by action', () => {
    expect(defaultActionName([action({ name: 'bad', valid: false }), action()])).toBe(
      'demo-evidence',
    );
    expect(defaultActionName([])).toBeNull();
    expect(sessionTabLabel(run('a', 'demo', 'x'), 'fallback')).toBe('demo');
    expect(sessionTabLabel(undefined, 'fallback')).toBe('fallback');
  });
});
