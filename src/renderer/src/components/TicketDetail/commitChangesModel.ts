import type { CommitRef } from '@hiveryn/shared/domain';

export interface ConclusionCommit {
  key: string;
  repo: string | null;
  sha: string | null;
  label: string;
  trace: string;
  error: string | null;
}

export function conclusionCommits(commits: CommitRef[]): ConclusionCommit[] {
  return commits.map((raw, index) => {
    const value = raw as Partial<CommitRef> | null;
    const repo = typeof value?.repo === 'string' && value.repo.trim() !== '' ? value.repo : null;
    const sha = typeof value?.sha === 'string' && value.sha.trim() !== '' ? value.sha : null;
    const shownRepo = repo ?? '<missing repository>';
    const shownSha = sha ?? '<missing SHA>';
    return {
      key: `${index}:${shownRepo}:${shownSha}`,
      repo,
      sha,
      label: `${shownRepo} · ${sha ? sha.slice(0, 10) : shownSha}`,
      trace: `${shownRepo} · ${shownSha}`,
      error:
        repo && sha
          ? null
          : `Malformed conclusion commit: repository=${shownRepo}, sha=${shownSha}`,
    };
  });
}

export class CommitRequestLifecycle {
  private generation = 0;
  private activeKey: string | null = null;

  select(key: string): number {
    this.activeKey = key;
    this.generation += 1;
    return this.generation;
  }

  owns(key: string, generation: number): boolean {
    return this.activeKey === key && this.generation === generation;
  }
}
