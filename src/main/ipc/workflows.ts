import type { WorkerPreflight, WorkflowList } from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

// The ticket launch dialog's two read calls. Both are read-only and neither
// creates anything: the daemon stays the only launch authority and revalidates
// the whole selection when the session is actually created.
export function registerWorkflowsIpc(): void {
  ipcMain.handle(
    'workflows:list',
    async (_event, architectKey: string): Promise<DaemonResult<WorkflowList>> =>
      daemonFetch<WorkflowList>(`/api/architects/${encodeURIComponent(architectKey)}/workflows`),
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
