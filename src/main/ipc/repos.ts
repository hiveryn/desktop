import { ipcMain } from 'electron';
import type { DaemonResult, RepoCommitDiffResponse, RepoDiffResponse } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

// A diff of a remote repository is several SSH round trips. The daemon bounds a
// diff at 60 s and reports its own error (with the SSH/Git cause); this bound
// sits beyond it so that error is what the user sees.
const DIFF_TIMEOUT_MS = 75_000;

function repoDiffPath(architectKey: string, repoKey: string): string {
  return `/api/architects/${encodeURIComponent(architectKey)}/repos/${encodeURIComponent(repoKey)}/diff`;
}

function repoCommitDiffPath(architectKey: string, repoKey: string, sha: string): string {
  return `/api/architects/${encodeURIComponent(architectKey)}/repos/${encodeURIComponent(repoKey)}/commits/${encodeURIComponent(sha)}/diff`;
}

export function registerReposIpc(): void {
  ipcMain.handle(
    'repos:diff',
    async (
      _event,
      architectKey: string,
      repoKey: string,
    ): Promise<DaemonResult<RepoDiffResponse>> => {
      return daemonFetch<RepoDiffResponse>(
        repoDiffPath(architectKey, repoKey),
        {},
        {
          timeoutMs: DIFF_TIMEOUT_MS,
        },
      );
    },
  );

  ipcMain.handle(
    'repos:commitDiff',
    async (
      _event,
      architectKey: string,
      repoKey: string,
      sha: string,
    ): Promise<DaemonResult<RepoCommitDiffResponse>> => {
      return daemonFetch<RepoCommitDiffResponse>(
        repoCommitDiffPath(architectKey, repoKey, sha),
        {},
        { timeoutMs: DIFF_TIMEOUT_MS },
      );
    },
  );
}
