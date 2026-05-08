import { ipcMain } from 'electron';
import type { DaemonResult, SystemHome } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerSystemIpc(): void {
  ipcMain.handle('system:getHome', async (): Promise<DaemonResult<SystemHome>> => {
    return daemonFetch<SystemHome>('/api/system/home');
  });
}
