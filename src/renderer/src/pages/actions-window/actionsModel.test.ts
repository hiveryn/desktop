import type { ActionDefinition, ActionRun } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  artifactListingNote,
  attentionNote,
  defaultActionName,
  launchBlocker,
  needsInput,
  requesterLabel,
  requestNote,
  runsFor,
  sessionTabLabel,
} from './actionsModel';

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

describe('requestNote', () => {
  const request = (overrides: Partial<ActionRun>): ActionRun => ({
    ...run('x', 'demo', '2026-09-24T08:00:00Z'),
    trigger: 'architect',
    architect_key: 'hiveryn',
    profile_name: '',
    ...overrides,
  });

  it('points a pending architect request at its approval surface', () => {
    expect(requestNote(request({ status: 'pending_approval' }))).toMatch(/architect hiveryn/);
  });

  it('attributes a worker request to its ticket and project', () => {
    const worker = request({
      status: 'pending_approval',
      trigger: 'worker',
      requester_ticket_id: 'ticket-1',
    });
    expect(requesterLabel(worker)).toBe('worker on ticket ticket-1 (architect hiveryn)');
    expect(requestNote(worker)).toMatch(/worker on ticket ticket-1.*architect hiveryn's window/);
    expect(requesterLabel(request({}))).toBe('architect hiveryn');
    expect(requesterLabel(run('m', 'demo', 'x'))).toBeNull();
  });

  it('says a denied or failed request never started', () => {
    expect(requestNote(request({ status: 'denied' }))).toMatch(/never started/);
    expect(requestNote(request({ status: 'failed' }))).toMatch(/never started/);
  });

  it('has nothing to add once it started, or for manual launches', () => {
    expect(
      requestNote(request({ status: 'running', started_at: '2026-09-24T08:01:00Z' })),
    ).toBeNull();
    expect(requestNote(run('m', 'demo', '2026-09-24T08:00:00Z'))).toBeNull();
  });
});

describe('needsInput / attentionNote', () => {
  const running = (attention?: ActionRun['attention']): ActionRun => ({
    ...run('a', 'demo', 'x'),
    status: 'running',
    attention,
  });

  it('reports input only for a running execution with an explicit signal', () => {
    const waiting = running({
      state: 'input_required',
      reason: 'folder_trust',
      source: 'terminal',
    });
    expect(needsInput(waiting)?.reason).toBe('folder_trust');
    expect(attentionNote(waiting)).toBeNull();
    expect(needsInput({ ...waiting, status: 'completed' })).toBeNull();
    expect(needsInput(running({ state: 'none_detected' }))).toBeNull();
  });

  it('adds no notice when no prompt was detected, and says so when attention is unknown', () => {
    expect(attentionNote(running({ state: 'none_detected', coverage: 'Codex: x.' }))).toBeNull();
    expect(attentionNote(running())).toMatch(/unknown/);
    expect(attentionNote(running({ state: 'unavailable' }))).toMatch(/unknown/);
    expect(attentionNote(run('a', 'demo', 'x'))).toBeNull();
  });
});

describe('artifactListingNote', () => {
  const listing = (over: Partial<Parameters<typeof artifactListingNote>[0]> = {}) => ({
    entries: null,
    error: null,
    loading: false,
    ...over,
  });

  it('says a running execution has no artifacts listed yet, never "Empty"', () => {
    expect(artifactListingNote(listing({ entries: [] }), true)).toEqual({
      kind: 'muted',
      text: 'No artifacts listed yet',
    });
    expect(artifactListingNote(listing({ entries: [] }), false)?.text).toBe(
      'No artifacts in the folder',
    );
  });

  it('keeps loading, listed entries and read errors distinct', () => {
    expect(artifactListingNote(listing({ loading: true }), true)?.text).toBe('Loading artifacts…');
    // A refresh in flight keeps the previous listing, with no loading note.
    expect(artifactListingNote(listing({ entries: ['a'], loading: true }), true)).toBeNull();
    expect(artifactListingNote(listing({ entries: ['a'] }), true)).toBeNull();
    expect(artifactListingNote(listing({ error: 'EACCES: permission denied' }), true)).toEqual({
      kind: 'error',
      text: 'Could not read the output folder: EACCES: permission denied',
    });
    expect(artifactListingNote(listing(), false)).toBeNull();
  });
});
