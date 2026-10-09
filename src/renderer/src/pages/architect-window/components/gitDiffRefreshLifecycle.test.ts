import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DiffContextToken, GitDiffRefreshLifecycle } from './gitDiffRefreshLifecycle';

afterEach(() => vi.useRealTimers());

function began(token: DiffContextToken | null): DiffContextToken {
  if (!token) throw new Error('request did not start');
  return token;
}

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

  it('runs one request per context and one follow-up for refreshes asked meanwhile', () => {
    const lifecycle = new GitDiffRefreshLifecycle();
    lifecycle.activate('session-a/repo-a');
    const first = lifecycle.tryBeginRequest('session-a/repo-a');
    expect(first).not.toBeNull();
    // A slow (SSH) request in flight: further refreshes do not stack.
    expect(lifecycle.tryBeginRequest('session-a/repo-a')).toBeNull();
    expect(lifecycle.tryBeginRequest('session-a/repo-a')).toBeNull();
    expect(lifecycle.finishRequest(began(first))).toBe(true);

    const followUp = lifecycle.tryBeginRequest('session-a/repo-a');
    expect(followUp).not.toBeNull();
    expect(lifecycle.finishRequest(began(followUp))).toBe(false);
  });

  it('starts a new context at once and never reruns a superseded request', () => {
    const lifecycle = new GitDiffRefreshLifecycle();
    lifecycle.activate('session-a/repo-a');
    const slowA = lifecycle.tryBeginRequest('session-a/repo-a');
    expect(lifecycle.tryBeginRequest('session-a/repo-a')).toBeNull();

    lifecycle.activate('session-a/repo-b');
    const b = lifecycle.tryBeginRequest('session-a/repo-b');
    expect(b).not.toBeNull();
    // A's late response neither publishes (owns) nor triggers a rerun, and
    // does not release B's in-flight slot.
    expect(lifecycle.owns(began(slowA))).toBe(false);
    expect(lifecycle.finishRequest(began(slowA))).toBe(false);
    expect(lifecycle.tryBeginRequest('session-a/repo-b')).toBeNull();
    expect(lifecycle.finishRequest(began(b))).toBe(true);
  });

  it('frees the slot after a failed request so Retry works', () => {
    const lifecycle = new GitDiffRefreshLifecycle();
    lifecycle.activate('ctx');
    const failed = lifecycle.tryBeginRequest('ctx');
    expect(lifecycle.finishRequest(began(failed))).toBe(false);
    expect(lifecycle.tryBeginRequest('ctx')).not.toBeNull();
  });
});
