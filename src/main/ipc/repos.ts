import { ipcMain } from 'electron';
import type {
  DaemonResult,
  RepoCommitDiffResponse,
  RepoDiffResponse,
  RepoStatusResponse,
} from '../../shared/types';
import { daemonFetch } from '../daemon/client';

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
      return daemonFetch<RepoDiffResponse>(repoDiffPath(architectKey, repoKey));
    },
  );

  ipcMain.handle(
    'repos:status',
    async (
      _event,
      architectKey: string,
      repoKey: string,
    ): Promise<DaemonResult<RepoStatusResponse>> => {
      return daemonFetch<RepoStatusResponse>(
        `/api/architects/${encodeURIComponent(architectKey)}/repos/${encodeURIComponent(repoKey)}/status`,
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
      return daemonFetch<RepoCommitDiffResponse>(repoCommitDiffPath(architectKey, repoKey, sha));
    },
  );
}
