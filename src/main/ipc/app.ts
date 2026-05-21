import { ipcMain } from 'electron';
import type { AppMode } from '../../shared/types';

export function registerAppIpc(): void {
  ipcMain.handle('app:getMode', (): AppMode => {
    return process.env.HIVERYN_APP_MODE === 'development' ? 'development' : 'production';
  });
}
