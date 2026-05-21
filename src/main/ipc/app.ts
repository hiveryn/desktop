import { ipcMain } from 'electron';
import type { AppMode } from '../../shared/types';
import { DAEMON_URL } from '../daemon/client';
import { IS_DESKTOP_DEVELOPMENT } from '../runtime';

export function registerAppIpc(): void {
  ipcMain.handle('app:getMode', (): AppMode => {
    return IS_DESKTOP_DEVELOPMENT ? 'development' : 'production';
  });
  ipcMain.handle('app:getDaemonUrl', (): string => DAEMON_URL);
}
