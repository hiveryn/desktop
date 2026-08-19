import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitDiffRefreshLifecycle } from './gitDiffRefreshLifecycle';

afterEach(() => vi.useRealTimers());

describe('GitDiffRefreshLifecycle', () => {
  it('rejects out-of-order responses from another session/repository and older requests', () => {
    const lifecycle = new GitDiffRefreshLifecycle();
    lifecycle.activate('session-a/repo-a');
    const requestA = lifecycle.beginRequest('session-a/repo-a');
    lifecycle.activate('session-b/repo-b');
    const oldRequestB = lifecycle.beginRequest('session-b/repo-b');
    const latestRequestB = lifecycle.beginRequest('session-b/repo-b');

    expect(lifecycle.owns(requestA)).toBe(false);
    expect(lifecycle.owns(oldRequestB)).toBe(false);
    expect(lifecycle.owns(latestRequestB)).toBe(true);
  });

  it('invalidates an old response across rapid A to B to A switching', () => {
    const lifecycle = new GitDiffRefreshLifecycle();
    lifecycle.activate('session-a/repo-a');
    const firstA = lifecycle.beginRequest('session-a/repo-a');
    lifecycle.activate('session-b/repo-b');
    lifecycle.activate('session-a/repo-a');
    const secondA = lifecycle.beginRequest('session-a/repo-a');

    expect(lifecycle.owns(firstA)).toBe(false);
    expect(lifecycle.owns(secondA)).toBe(true);
  });

  it('tracks equal sequence numbers independently for concurrent sessions', () => {
    const lifecycle = new GitDiffRefreshLifecycle();
    const eventA = { seq: 7, repo: 'a' };
    const eventB = { seq: 7, repo: 'b' };

    expect(lifecycle.takeUnseen('session-a', [eventA])).toEqual([eventA]);
    expect(lifecycle.takeUnseen('session-b', [eventB])).toEqual([eventB]);
    expect(lifecycle.takeUnseen('session-a', [eventA])).toEqual([]);
    expect(lifecycle.takeUnseen('session-b', [eventB])).toEqual([]);
  });

  it('does not run pending debounce work after a session or repository switch', () => {
    vi.useFakeTimers();
    const lifecycle = new GitDiffRefreshLifecycle();
    const refresh = vi.fn();
    lifecycle.activate('session-a/repo-a');
    lifecycle.schedule('session-a/repo-a', 1500, refresh);

    lifecycle.activate('session-b/repo-b');
    vi.advanceTimersByTime(1500);

    expect(refresh).not.toHaveBeenCalled();
  });
});
