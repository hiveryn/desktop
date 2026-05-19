import { ipcMain } from 'electron';
import type { Architect, DaemonResult } from '../../shared/types';
import * as architectEvents from '../daemon/architect-events';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, ok, withData, withNullData } from './results';

interface ArchitectListPayload {
  architects: Architect[];
}

export function registerArchitectsIpc(): void {
  ipcMain.handle('architects:list', async (): Promise<DaemonResult<Architect[]>> => {
    const result = await daemonFetch<ArchitectListPayload>('/api/architects');
    if (result.envelope.error) {
      return withNullData(result);
    }
    if (!Array.isArray(result.envelope.data?.architects)) {
      return invalidDaemonResponse('architects:list returned missing architects array');
    }
    return withData(result, result.envelope.data.architects);
  });

  ipcMain.handle(
    'architects:get',
    async (_event, key: string): Promise<DaemonResult<Architect>> => {
      return daemonFetch<Architect>(`/api/architects/${encodeURIComponent(key)}`);
    },
  );

  ipcMain.handle('architects:events:subscribe', (event, key: string): DaemonResult<null> => {
    architectEvents.subscribe(event.sender, key);
    return ok(null);
  });

  ipcMain.handle('architects:events:unsubscribe', (event, key: string): DaemonResult<null> => {
    architectEvents.unsubscribe(event.sender.id, key);
    return ok(null);
  });
}
