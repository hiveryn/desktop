import { ipcMain } from 'electron';
import type { Theme } from '../../shared/types';

let theme: Theme = 'system';

export function registerPreferencesIpc(): void {
  ipcMain.handle('preferences:getTheme', () => theme);
  ipcMain.handle('preferences:setTheme', (_event, value: Theme) => {
    theme = value;
  });
  // Mock user API — returns the shape of a future REST response
  ipcMain.handle('user:getProfile', () => ({ data: { name: 'Kareem' } }));
}
