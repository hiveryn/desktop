import { describe, expect, it } from 'vitest';
import { CommitRequestLifecycle, conclusionCommits } from './commitChangesModel';

describe('conclusionCommits', () => {
  it('describes one commit with a short label and full trace', () => {
    const [commit] = conclusionCommits([{ repo: 'desktop', sha: '1234567890abcdef' }]);
    expect(commit.label).toBe('desktop · 1234567890');
    expect(commit.trace).toBe('desktop · 1234567890abcdef');
    expect(commit.error).toBeNull();
  });

  it('keeps several commits in one repository distinct', () => {
    const commits = conclusionCommits([
      { repo: 'desktop', sha: 'aaaaaaaaaaaa' },
      { repo: 'desktop', sha: 'bbbbbbbbbbbb' },
    ]);
    expect(new Set(commits.map((commit) => commit.key)).size).toBe(2);
  });

  it('keeps repositories attached to their own commits', () => {
    const commits = conclusionCommits([
      { repo: 'desktop', sha: 'aaaaaaaaaaaa' },
      { repo: 'daemon', sha: 'bbbbbbbbbbbb' },
    ]);
    expect(commits.map(({ repo, sha }) => [repo, sha])).toEqual([
      ['desktop', 'aaaaaaaaaaaa'],
      ['daemon', 'bbbbbbbbbbbb'],
    ]);
  });

  it('returns no selectors for a conclusion without commits', () => {
    expect(conclusionCommits([])).toEqual([]);
  });

  it('attributes malformed entries instead of throwing', () => {
    const [commit] = conclusionCommits([{ repo: '', sha: '' }]);
    expect(commit.trace).toBe('<missing repository> · <missing SHA>');
    expect(commit.error).toContain('Malformed conclusion commit');
  });
});

describe('CommitRequestLifecycle', () => {
  it('rejects a late response after rapid selection changes', () => {
    const lifecycle = new CommitRequestLifecycle();
    const first = lifecycle.select('desktop:a');
    const second = lifecycle.select('daemon:b');
    expect(lifecycle.owns('desktop:a', first)).toBe(false);
    expect(lifecycle.owns('daemon:b', second)).toBe(true);
  });

  it('keeps an absent-commit failure attributable to its selection', () => {
    const lifecycle = new CommitRequestLifecycle();
    const request = lifecycle.select('desktop:missing');
    expect(lifecycle.owns('desktop:missing', request)).toBe(true);
  });
});
