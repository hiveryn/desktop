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
  it('keeps a completed execution reachable: conclusion and output folder', () => {
    const html = renderToStaticMarkup(<ActionRunDetail run={completed} />);
    expect(html).toContain('completed');
    expect(html).toContain('LDN run 2 recovered');
    expect(html).toContain(completed.output_dir);
    expect(html).toContain('Reveal in Finder');
    expect(html).toContain('Copy path');
    // The folder is never listed or reread — no artifact browser.
    expect(html).not.toContain('Refresh');
    expect(html).toContain('Completed without artifacts.');
    expect(html).not.toContain('Stop execution');
  });

  it('shows where a remote execution ran, its frozen package and delivered copies', () => {
    const remote: ActionRun = {
      ...completed,
      machine: 'box',
      repo_path: '/srv/actions/demo-evidence',
      output_dir: '/home/x/.local/state/hiveryn-actions/runs/demo-evidence/run-1',
      delivery_dir: '/home/x/.local/state/hiveryn-actions/runs/demo-evidence/run-1',
      package: {
        machine: 'box',
        path: '/home/x/.local/state/hiveryn-actions/artifacts/packages/run-1',
        state: 'ready',
        files: 2,
        bytes: 40,
        expires_at: '2026-10-24T08:05:00Z',
      },
      deliveries: [
        {
          path: '/Users/me/.hiveryn/action-artifacts/deliveries/run-1',
          state: 'ready',
          files: 2,
          bytes: 40,
        },
        {
          machine: 'other',
          path: '/home/y/.local/state/hiveryn-actions/artifacts/deliveries/run-1',
          state: 'failed',
          error: 'ssh: connect to host other: Connection refused',
          files: 0,
          bytes: 0,
        },
      ],
    };
    const html = renderToStaticMarkup(<ActionRunDetail run={remote} />);
    expect(html).toContain('machine box');
    expect(html).toContain('/home/x/.local/state/hiveryn-actions/artifacts/packages/run-1');
    expect(html).toContain('ready · expires');
    expect(html).toContain('2 files, 40 bytes');
    expect(html).toContain('Connection refused');
    expect(html).toContain('copy failed');
    // Only the local copy can be revealed; the remote package and working
    // folder offer their paths only.
    expect(html.match(/Reveal in Finder/g)).toHaveLength(1);
    expect(html.match(/Copy path/g)).toHaveLength(3);
  });

  it('attributes a worker request to its ticket and project', () => {
    const html = renderToStaticMarkup(
      <ActionRunDetail
        run={{
          ...completed,
          trigger: 'worker',
          architect_key: 'hiveryn',
          requester_session_id: 's-9',
          requester_ticket_id: 'ticket-1',
        }}
      />,
    );
    expect(html).toContain('Requested by');
    expect(html).toContain('worker on ticket ticket-1 (architect hiveryn)');
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
    // Nothing is known about its attention yet: said so, never "not waiting".
    expect(html).toContain('its terminal is not live');
    expect(html).not.toContain('Needs your input');
  });

  it('shows a detected prompt with a route to the terminal, still running', () => {
    const waiting: ActionRun = {
      ...completed,
      status: 'running',
      summary: undefined,
      session_id: 's-1',
      attention: {
        state: 'input_required',
        reason: 'folder_trust',
        message: 'Codex is asking whether to trust this folder before it starts.',
        source: 'terminal',
        since: '2026-09-24T08:01:00Z',
        coverage: 'Codex: …',
      },
    };
    const html = renderToStaticMarkup(
      <ActionRunDetail run={waiting} onOpenSession={() => undefined} />,
    );
    expect(html).toContain('Needs your input');
    expect(html).toContain('whether to trust this folder');
    expect(html).toContain('its terminal screen');
    expect(html).toContain('Open terminal');
    expect(html).toContain('running');
  });

  it('adds no routine notice when no prompt was detected', () => {
    const quiet: ActionRun = {
      ...completed,
      status: 'running',
      summary: undefined,
      session_id: 's-1',
      attention: { state: 'none_detected', coverage: 'Codex: approval prompts are detected.' },
    };
    const html = renderToStaticMarkup(
      <ActionRunDetail run={quiet} onOpenSession={() => undefined} />,
    );
    expect(html).not.toContain('No prompt detected');
    expect(html).not.toContain('approval prompts are detected');
    expect(html).not.toContain('Needs your input');
    // The terminal stays reachable.
    expect(html).toContain('Open session');
  });
});

describe('ActionsHome', () => {
  const list: ActionList = {
    registry: '/home/.hiveryn/actions.yaml',
    actions: [
      {
        name: 'demo-evidence',
        path: '/home/.hiveryn/actions/demo-evidence',
        variants: ['claude-sonnet'],
        description: 'Compare AMS and LDN. Say how many runs.',
        artifacts: 'summary.md, results.json',
        valid: true,
        problems: [],
        running_execution_id: 'run-2',
        suggestions: ['Compare AMS and LDN three times', 'Compare with a first-attempt failure'],
      },
      {
        name: 'broken',
        path: '/home/.hiveryn/actions/broken',
        variants: ['claude-sonnet'],
        description: '',
        artifacts: '',
        valid: false,
        problems: [
          { path: '/home/.hiveryn/actions/broken/KICKOFF.md', message: 'file is missing' },
        ],
        suggestions: ['never offered'],
      },
      {
        name: 'remote-evidence',
        path: '/srv/actions/remote-evidence',
        machine: 'box',
        variants: ['box-codex'],
        description: 'Collects evidence on box.',
        artifacts: 'summary.md',
        valid: true,
        problems: [],
      },
    ],
  };

  const render = (selected: string, runs: ActionRun[] = [completed]) =>
    renderToStaticMarkup(
      <ActionsHome
        list={list}
        runs={runs}
        profiles={[
          { name: 'claude-sonnet', agent: 'claude', args: [], env: {} },
          { name: 'box-codex', agent: 'codex', machine: 'box', args: [], env: {} },
        ]}
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

  it('marks a history entry whose agent needs input', () => {
    const waiting: ActionRun = {
      ...completed,
      id: 'run-2',
      status: 'running',
      attention: { state: 'input_required', reason: 'awaiting_input', source: 'hook' },
    };
    const html = renderToStaticMarkup(
      <ActionsHome
        list={list}
        runs={[waiting, completed]}
        profiles={[]}
        selectedAction="demo-evidence"
        onSelectAction={() => undefined}
        selectedRunId={null}
        onSelectRun={() => undefined}
        onLaunched={() => undefined}
        onOpenSession={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html.match(/needs input/g)).toHaveLength(1);
  });

  it('says where each action runs', () => {
    // Variant eligibility per machine is covered by launchProfiles.
    expect(render('remote-evidence')).toContain('Runs on machine box');
    expect(render('remote-evidence')).toContain('/srv/actions/remote-evidence');
    expect(render('demo-evidence')).toContain('Runs on local');
  });

  it('reports an invalid definition with its problems', () => {
    const html = render('broken');
    expect(html).toContain('file is missing');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });

  it('orders the column: launch form, executions, then the definition', () => {
    const html = render('demo-evidence');
    const form = html.indexOf('<form');
    const executions = html.indexOf('Executions');
    const description = html.indexOf('Say how many runs.');
    const delivers = html.indexOf('Delivers');
    expect(form).toBeGreaterThanOrEqual(0);
    expect(form).toBeLessThan(executions);
    expect(executions).toBeLessThan(description);
    expect(description).toBeLessThan(delivers);
  });

  it('offers suggested prompts as non-submitting chips inside the launch form', () => {
    const html = render('demo-evidence');
    const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
    const chips = form.match(/<button type="button"[^>]*title="[^"]*"[^>]*>[^<]*<\/button>/g) ?? [];
    expect(chips).toHaveLength(2);
    expect(chips[0]).toContain('Compare AMS and LDN three times');
    expect(chips[1]).toContain('Compare with a first-attempt failure');
  });

  it('offers no suggestions for an invalid definition', () => {
    expect(render('broken')).not.toContain('never offered');
    expect(render('broken')).not.toContain('Suggested prompts');
  });

  it('lists at most the latest ten executions of the selected action', () => {
    const runs = Array.from({ length: 12 }, (_, i) => ({
      ...completed,
      id: `run-${i}`,
      summary: `summary ${String(i).padStart(2, '0')}`,
      created_at: `2026-09-24T08:${String(i).padStart(2, '0')}:00Z`,
    }));
    const html = render('demo-evidence', runs);
    const listed = html.match(/summary \d\d/g) ?? [];
    // The newest is also shown in the detail column; the list holds 11..2.
    expect(new Set(listed)).toEqual(
      new Set(Array.from({ length: 10 }, (_, i) => `summary ${String(11 - i).padStart(2, '0')}`)),
    );
    expect(html).toContain('latest 10 of 12');
  });
});

describe('optional and partial artifacts', () => {
  it('distinguishes artifact-free completion from a missing promised package', () => {
    const noFiles = renderToStaticMarkup(
      <ActionRunDetail run={{ ...completed, output_dir: '' }} />,
    );
    expect(noFiles).toContain('Completed without artifacts.');
    expect(noFiles).not.toContain('Working folder');
    const optional = renderToStaticMarkup(
      <ActionRunDetail
        run={{ ...completed, artifact_mode: 'optional', artifact_contract: 'requested files' }}
      />,
    );
    expect(optional).toContain('Completed without artifacts.');
    expect(optional).not.toContain('Expected artifact package is missing.');
    const missing = renderToStaticMarkup(
      <ActionRunDetail run={{ ...completed, artifact_contract: 'report.txt' }} />,
    );
    expect(missing).toContain('Expected artifact package is missing.');
  });
  it('keeps failed outcomes visible alongside their approved partial artifacts', () => {
    const html = renderToStaticMarkup(
      <ActionRunDetail
        run={{
          ...completed,
          status: 'failed',
          summary: 'Second export failed',
          package: { path: '/partial', state: 'ready', files: 1, bytes: 42 },
        }}
      />,
    );
    expect(html).toContain('failed');
    expect(html).toContain('Second export failed');
    expect(html).toContain('Partial artifacts');
    expect(html).toContain('/partial');
    expect(html).toContain('Reveal in Finder');
  });
});
