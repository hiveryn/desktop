import { ipcMain } from 'electron';

export function registerPreferencesIpc(): void {
  // Mock user API — returns the shape of a future REST response
  ipcMain.handle('user:getProfile', () => ({ data: { name: 'Kareem' } }));
}
