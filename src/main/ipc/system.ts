import { homedir } from 'node:os';
import { ipcMain } from 'electron';
import type { DaemonResult, SystemRuntime } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerSystemIpc(): void {
  ipcMain.handle('system:getRuntime', async (): Promise<DaemonResult<SystemRuntime>> => {
    return daemonFetch<SystemRuntime>('/api/system/runtime');
  });

  // The user's OS home directory. Distinct from SystemRuntime.home, which is
  // the daemon's data dir (~/.hiveryn) — using that for ~-expansion or path
  // shortening is a bug.
  ipcMain.handle('system:getUserHome', (): string => homedir());
}
