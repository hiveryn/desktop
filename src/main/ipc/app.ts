import { ipcMain } from 'electron';
import type { AppMode } from '../../shared/types';
import { DAEMON_URL } from '../daemon/client';

export function registerAppIpc(): void {
  ipcMain.handle('app:getMode', (): AppMode => {
    return process.env.HIVERYN_APP_MODE === 'development' ? 'development' : 'production';
  });
  ipcMain.handle('app:getDaemonUrl', (): string => DAEMON_URL);
}
