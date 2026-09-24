import type { ActionList, ActionRun } from '@hiveryn/shared/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ActionRunDetail from './ActionRunDetail';
import ActionsHome from './ActionsHome';

const completed: ActionRun = {
  id: 'run-1',
  action: 'demo-evidence',
  trigger: 'manual',
  status: 'completed',
  prompt: 'Run AMS and LDN three times each',
  profile_name: 'claude-sonnet',
  repo_path: '/home/.hiveryn/actions/demo-evidence',
  output_dir: '/home/.hiveryn/action-runs/demo-evidence/run-1',
  summary: 'AMS 19.7% vs LDN 8.5%; LDN run 2 recovered on retry.',
  created_at: '2026-09-24T08:00:00Z',
  started_at: '2026-09-24T08:00:00Z',
  ended_at: '2026-09-24T08:05:00Z',
};

describe('ActionRunDetail', () => {
  it('keeps a completed execution browsable: conclusion and output folder', () => {
    const html = renderToStaticMarkup(<ActionRunDetail run={completed} />);
    expect(html).toContain('completed');
    expect(html).toContain('LDN run 2 recovered');
    expect(html).toContain(completed.output_dir);
    expect(html).toContain('Reveal in Finder');
    expect(html).not.toContain('Stop execution');
  });

  it('offers follow-up and stop for a running execution', () => {
    const running: ActionRun = {
      ...completed,
      status: 'running',
      summary: undefined,
      session_id: 's-1',
    };
    const html = renderToStaticMarkup(
      <ActionRunDetail run={running} onOpenSession={() => undefined} onCancel={() => undefined} />,
    );
    expect(html).toContain('Open session');
    expect(html).toContain('Stop execution');
  });
});

describe('ActionsHome', () => {
  const list: ActionList = {
    root: '/home/.hiveryn/actions',
    actions: [
      {
        name: 'demo-evidence',
        path: '/home/.hiveryn/actions/demo-evidence',
        description: 'Compare AMS and LDN. Say how many runs.',
        artifacts: 'summary.md, results.json',
        valid: true,
        problems: [],
        running_execution_id: 'run-2',
      },
      {
        name: 'broken',
        path: '/home/.hiveryn/actions/broken',
        description: '',
        artifacts: '',
        valid: false,
        problems: [
          { path: '/home/.hiveryn/actions/broken/KICKOFF.md', message: 'file is missing' },
        ],
      },
    ],
  };

  const render = (selected: string) =>
    renderToStaticMarkup(
      <ActionsHome
        list={list}
        runs={[completed]}
        profiles={[{ name: 'claude-sonnet', agent: 'claude', args: [], env: {} }]}
        selectedAction={selected}
        onSelectAction={() => undefined}
        selectedRunId={null}
        onSelectRun={() => undefined}
        onLaunched={() => undefined}
        onOpenSession={() => undefined}
        onCancel={() => undefined}
      />,
    );

  it('shows the definition, busy state and history of the selected action', () => {
    const html = render('demo-evidence');
    expect(html).toContain('Say how many runs.');
    expect(html).toContain('summary.md, results.json');
    expect(html).toContain('run-2');
    expect(html).toContain('One execution of an action runs at a time');
    expect(html).toContain('LDN run 2 recovered');
  });

  it('reports an invalid definition with its problems', () => {
    const html = render('broken');
    expect(html).toContain('file is missing');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
});
