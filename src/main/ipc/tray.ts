import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { hideTrayWindow, setTrayWindowHeight } from '../tray';
import { ok } from './results';

export function registerTrayIpc(): void {
  ipcMain.handle('tray:hide', (): DaemonResult<null> => {
    hideTrayWindow();
    return ok(null);
  });

  ipcMain.handle('tray:set-height', (_event, height: number): DaemonResult<null> => {
    setTrayWindowHeight(height);
    return ok(null);
  });
}
