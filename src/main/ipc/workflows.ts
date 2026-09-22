import type { WorkerPreflight, WorkflowList } from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

// The ticket launch dialog's two read calls. Both are read-only and neither
// creates anything: the daemon stays the only launch authority and revalidates
// the whole selection when the session is actually created.
export function registerWorkflowsIpc(): void {
  // Discovery for one session's writable repo scope. `repos` is the ticket's
  // primary repo plus its additional repos; an empty scope is legal and simply
  // suggests nothing.
  ipcMain.handle(
    'workflows:list',
    async (_event, architectKey: string, repos: string[]): Promise<DaemonResult<WorkflowList>> => {
      const scope = repos
        .map((repo) => repo.trim())
        .filter((repo) => repo !== '')
        .join(',');
      const query = scope === '' ? '' : `?repos=${encodeURIComponent(scope)}`;
      return daemonFetch<WorkflowList>(
        `/api/architects/${encodeURIComponent(architectKey)}/workflows${query}`,
      );
    },
  );

  // Whether the workspace's required project context can host a worker at all.
  // Deliberately not the workspace check: that verdict also covers
  // architect-only artifacts and unselected workflows, which never block one.
  ipcMain.handle(
    'workflows:preflight',
    async (_event, architectKey: string): Promise<DaemonResult<WorkerPreflight>> => {
      return daemonFetch<WorkerPreflight>(
        `/api/architects/${encodeURIComponent(architectKey)}/workspace/worker-preflight`,
      );
    },
  );
}
