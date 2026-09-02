import type { RoadmapView } from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { DaemonResult, RoadmapReadParams } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

function roadmapPath(architectKey: string, params: RoadmapReadParams): string {
  const query = new URLSearchParams();
  if (params.view) query.set('view', params.view);
  if (params.id) query.set('id', params.id);
  if (params.depth !== undefined) query.set('depth', String(params.depth));
  const qs = query.toString();
  return `/api/architects/${encodeURIComponent(architectKey)}/roadmap${qs ? `?${qs}` : ''}`;
}

// Read-only surface — desktop never mutates the roadmap. All mutations go
// through the architect's own MCP tools.
export function registerRoadmapIpc(): void {
  ipcMain.handle(
    'roadmap:read',
    async (
      _event,
      architectKey: string,
      params: RoadmapReadParams = {},
    ): Promise<DaemonResult<RoadmapView>> => {
      return daemonFetch<RoadmapView>(roadmapPath(architectKey, params));
    },
  );
}
