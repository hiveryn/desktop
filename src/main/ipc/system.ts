import { ipcMain } from 'electron';
import type { DaemonResult, SystemRuntime } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerSystemIpc(): void {
  ipcMain.handle('system:getRuntime', async (): Promise<DaemonResult<SystemRuntime>> => {
    return daemonFetch<SystemRuntime>('/api/system/runtime');
  });
}
