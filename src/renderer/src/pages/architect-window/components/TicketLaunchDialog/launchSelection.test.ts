import type { WorkerPreflight, Workflow, WorkflowList } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  filterAgentNames,
  findRelaunchableSession,
  groupWorkflows,
  initialSelection,
  isSelectable,
  launchBlockers,
  launchProblems,
  reconcileSelection,
  resolvePreferredProfile,
  suggestionReason,
  toggleSelection,
} from './launchSelection';

const WS = '/ws/workflows';

function workflow(overrides: Partial<Workflow> & { name: string }): Workflow {
  return {
    path: `${WS}/${overrides.name}.md`,
    rel_path: `workflows/${overrides.name}.md`,
    attach: 'manual',
    repos: [],
    valid: true,
    suggested: false,
    modified_at: null,
    diagnostics: [],
    ...overrides,
  };
}

function list(workflows: Workflow[], scopeRepos: string[] = []): WorkflowList {
  return {
    architect_key: 'hiveryn',
    scope_repos: scopeRepos,
    workflows,
    diagnostics: [],
  };
}

const ready: WorkerPreflight = {
  architect_key: 'hiveryn',
  checked_at: '2026-09-22T10:00:00Z',
  launchable: true,
  problems: [],
};

describe('filterAgentNames', () => {
  const names = ['claude-opus-work', 'claude-fable', 'codex-high'];

  it('lists every variant for an empty query', () => {
    expect(filterAgentNames(names, '  ')).toEqual(names);
  });

  it('matches a case-insensitive substring of the name, keeping order', () => {
    expect(filterAgentNames(names, 'CLAUDE')).toEqual(['claude-opus-work', 'claude-fable']);
    expect(filterAgentNames(names, 'high')).toEqual(['codex-high']);
  });

  it('is empty when nothing matches', () => {
    expect(filterAgentNames(names, 'gemini')).toEqual([]);
  });
});

describe('suggestionReason', () => {
  it('names only the repos that overlap the session scope', () => {
    const matched = workflow({
      name: 'DELIVER',
      attach: 'suggested',
      repos: ['core', 'agent-a', 'unrelated'],
      suggested: true,
    });
    expect(suggestionReason(matched, ['core', 'agent-a'])).toBe('Matches: core, agent-a');
  });

  // The daemon suggests on an overlap with ANY repo in scope, so a single
  // additional repo is enough on its own.
  it('matches on an additional repo alone', () => {
    const matched = workflow({
      name: 'DELIVER',
      attach: 'suggested',
      repos: ['agent-a'],
      suggested: true,
    });
    expect(suggestionReason(matched, ['core', 'agent-a'])).toBe('Matches: agent-a');
  });

  it('is empty for a workflow the daemon did not suggest', () => {
    const manual = workflow({ name: 'MANUAL' });
    expect(suggestionReason(manual, ['core'])).toBe('');
  });
});

describe('groupWorkflows', () => {
  it('splits suggested, available and invalid, keeping daemon order', () => {
    const suggested = workflow({
      name: 'A',
      attach: 'suggested',
      repos: ['core'],
      suggested: true,
    });
    const manual = workflow({ name: 'B' });
    const unmatched = workflow({ name: 'C', attach: 'suggested', repos: ['other'] });
    const broken = workflow({
      name: 'D',
      valid: false,
      diagnostics: [
        {
          code: 'MISSING_FRONTMATTER',
          severity: 'error',
          path: 'workflows/D.md',
          line: 0,
          message: 'no frontmatter',
        },
      ],
    });

    const groups = groupWorkflows(list([suggested, manual, unmatched, broken], ['core']));
    expect(groups.suggested.map((w) => w.name)).toEqual(['A']);
    expect(groups.available.map((w) => w.name)).toEqual(['B', 'C']);
    expect(groups.invalid.map((w) => w.name)).toEqual(['D']);
  });

  // An invalid workflow the daemon still flagged as suggested must never be
  // preselected, and must never become selectable.
  it('keeps an invalid workflow out of the selectable groups', () => {
    const broken = workflow({ name: 'D', valid: false, suggested: true });
    const groups = groupWorkflows(list([broken], ['core']));
    expect(groups.suggested).toHaveLength(0);
    expect(groups.invalid).toHaveLength(1);
    expect(isSelectable(broken)).toBe(false);
  });
});

describe('initialSelection', () => {
  it('preselects every valid suggestion and nothing else', () => {
    const a = workflow({ name: 'A', attach: 'suggested', repos: ['core'], suggested: true });
    const b = workflow({ name: 'B', attach: 'suggested', repos: ['agent-a'], suggested: true });
    const manual = workflow({ name: 'M' });
    expect(initialSelection(list([a, manual, b], ['core', 'agent-a']))).toEqual([a.path, b.path]);
  });

  it('is empty when nothing matches, which is a valid launch', () => {
    const unmatched = workflow({ name: 'A', attach: 'suggested', repos: ['other'] });
    expect(initialSelection(list([unmatched, workflow({ name: 'M' })], ['core']))).toEqual([]);
  });

  it('is empty for an empty workflow list', () => {
    expect(initialSelection(list([]))).toEqual([]);
  });

  it('never preselects an invalid suggestion', () => {
    const broken = workflow({ name: 'A', suggested: true, valid: false });
    expect(initialSelection(list([broken], ['core']))).toEqual([]);
  });
});

describe('reconcileSelection', () => {
  const a = workflow({ name: 'A', attach: 'suggested', repos: ['core'], suggested: true });
  const manual = workflow({ name: 'M' });

  it('keeps the user choices a refresh did not invalidate', () => {
    // The user removed the suggestion and added the manual one.
    const chosen = [manual.path];
    expect(reconcileSelection(chosen, list([a, manual], ['core']))).toEqual([manual.path]);
  });

  it('does not re-add a suggestion the user removed', () => {
    expect(reconcileSelection([], list([a], ['core']))).toEqual([]);
  });

  it('does not drop a selection that merely stopped being suggested', () => {
    const noLongerSuggested = { ...a, suggested: false, attach: 'suggested' as const };
    expect(reconcileSelection([a.path], list([noLongerSuggested], []))).toEqual([a.path]);
  });

  it('drops a path that disappeared or went invalid', () => {
    const brokenNow = { ...manual, valid: false };
    expect(reconcileSelection([a.path, manual.path], list([brokenNow]))).toEqual([]);
  });

  it('preserves selection order', () => {
    expect(reconcileSelection([manual.path, a.path], list([a, manual]))).toEqual([
      manual.path,
      a.path,
    ]);
  });
});

describe('toggleSelection', () => {
  it('adds at the end and removes in place', () => {
    expect(toggleSelection([], `${WS}/A.md`)).toEqual([`${WS}/A.md`]);
    expect(toggleSelection([`${WS}/A.md`, `${WS}/B.md`], `${WS}/A.md`)).toEqual([`${WS}/B.md`]);
  });
});

describe('launchBlockers', () => {
  const loaded = list([workflow({ name: 'A' })]);

  it('is empty when the workspace is ready and a profile is chosen', () => {
    expect(
      launchBlockers({
        profileName: 'claude-fable',
        preflight: ready,
        list: loaded,
        selection: [],
        submitting: false,
      }),
    ).toEqual([]);
  });

  it('reports the daemon preflight problems verbatim', () => {
    const blocked: WorkerPreflight = {
      ...ready,
      launchable: false,
      problems: ['PROJECT_STATE.md MISSING_REQUIRED_FILE: the file does not exist'],
    };
    expect(
      launchBlockers({
        profileName: 'claude-fable',
        preflight: blocked,
        list: loaded,
        selection: [],
        submitting: false,
      }),
    ).toEqual(['PROJECT_STATE.md MISSING_REQUIRED_FILE: the file does not exist']);
  });

  it('blocks without a profile selection', () => {
    expect(
      launchBlockers({
        profileName: null,
        preflight: ready,
        list: loaded,
        selection: [],
        submitting: false,
      }),
    ).toEqual(['no agent profile is selected']);
  });

  it('blocks a selection the refreshed listing no longer offers', () => {
    expect(
      launchBlockers({
        profileName: 'claude-fable',
        preflight: ready,
        list: loaded,
        selection: [`${WS}/GONE.md`],
        submitting: false,
      }),
    ).toEqual([`${WS}/GONE.md is no longer selectable`]);
  });

  it('blocks a second submission while one is in flight', () => {
    expect(
      launchBlockers({
        profileName: 'claude-fable',
        preflight: ready,
        list: loaded,
        selection: [],
        submitting: true,
      }),
    ).toEqual(['a launch is already in flight']);
  });

  it('blocks until both daemon answers have arrived', () => {
    expect(
      launchBlockers({
        profileName: 'claude-fable',
        preflight: null,
        list: null,
        selection: [],
        submitting: false,
      }),
    ).toEqual([
      'the architect workspace has not been checked yet',
      'the workflow list has not loaded yet',
    ]);
  });
});

describe('resolvePreferredProfile', () => {
  const profiles = [{ name: 'claude-fable' }, { name: 'codex' }];

  it('keeps a preference that still resolves', () => {
    expect(resolvePreferredProfile('codex', profiles)).toBe('codex');
  });

  it('drops a preference no listed profile matches', () => {
    expect(resolvePreferredProfile('deleted-profile', profiles)).toBeNull();
  });

  it('has no selection without a preference', () => {
    expect(resolvePreferredProfile(null, profiles)).toBeNull();
  });
});

describe('findRelaunchableSession', () => {
  const base = {
    architect_key: 'hiveryn',
    session_type: 'ticket',
    context_id: 'ticket-1',
    workflows: [`${WS}/A.md`],
  };

  it('finds a ticket session that was created but never launched', () => {
    const found = findRelaunchableSession([{ ...base, id: 's1' }], 'hiveryn', 'ticket-1');
    expect(found?.id).toBe('s1');
    expect(found?.workflows).toEqual([`${WS}/A.md`]);
  });

  it('ignores a session that is already running', () => {
    const sessions = [{ ...base, id: 's1', current_run: { status: 'running' } }];
    expect(findRelaunchableSession(sessions, 'hiveryn', 'ticket-1')).toBeNull();
  });

  it('ignores other tickets, other architects and other session types', () => {
    const sessions = [
      { ...base, id: 's1', context_id: 'ticket-2' },
      { ...base, id: 's2', architect_key: 'other' },
      { ...base, id: 's3', session_type: 'freeform' },
    ];
    expect(findRelaunchableSession(sessions, 'hiveryn', 'ticket-1')).toBeNull();
  });

  it('adopts a failed run rather than treating it as absent', () => {
    const sessions = [{ ...base, id: 's1', current_run: { status: 'failed' } }];
    expect(findRelaunchableSession(sessions, 'hiveryn', 'ticket-1')?.id).toBe('s1');
  });
});

describe('launchProblems', () => {
  const loaded = list([workflow({ name: 'A' })]);

  it('keeps only what the user must fix, not pending or unpicked state', () => {
    expect(
      launchProblems({
        profileName: null,
        preflight: null,
        list: null,
        selection: [],
        submitting: true,
      }),
    ).toEqual([]);
  });

  it('carries the preflight problems and unselectable paths', () => {
    expect(
      launchProblems({
        profileName: null,
        preflight: { ...ready, launchable: false, problems: ['PROJECT_OVERVIEW.md missing'] },
        list: loaded,
        selection: [`${WS}/GONE.md`],
        submitting: false,
      }),
    ).toEqual(['PROJECT_OVERVIEW.md missing', `${WS}/GONE.md is no longer selectable`]);
  });
});
