import { ipcMain } from 'electron';
import type { Architect, DaemonResult, SpawnResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

interface ArchitectListPayload {
  architects: Architect[];
}

function mapData<TInput, TOutput>(
  result: DaemonResult<TInput>,
  map: (data: TInput | null) => TOutput | null,
): DaemonResult<TOutput> {
  return {
    httpStatus: result.httpStatus,
    envelope: {
      ...result.envelope,
      data: result.envelope.error ? null : map(result.envelope.data),
    },
  };
}

export function registerArchitectsIpc(): void {
  ipcMain.handle('architects:list', async (): Promise<DaemonResult<Architect[]>> => {
    const result = await daemonFetch<ArchitectListPayload>('/api/architects');
    return mapData(result, (data) => data?.architects ?? []);
  });

  ipcMain.handle(
    'architects:get',
    async (_event, key: string): Promise<DaemonResult<Architect>> => {
      return daemonFetch<Architect>(`/api/architects/${encodeURIComponent(key)}`);
    },
  );

  ipcMain.handle(
    'architects:spawn',
    async (_event, key: string, profileName: string): Promise<DaemonResult<SpawnResult>> => {
      return daemonFetch<SpawnResult>(`/api/architects/${encodeURIComponent(key)}/spawn`, {
        method: 'POST',
        body: JSON.stringify({ profile_name: profileName }),
      });
    },
  );
}
