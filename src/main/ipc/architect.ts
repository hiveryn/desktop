import { BrowserWindow, ipcMain } from 'electron';
import type { ArchitectInfo, DaemonResult } from '../../shared/types';
import { ok } from './results';

interface ArchitectIpcOptions {
  openLauncherWindow: () => void;
}

export function registerArchitectIpc({ openLauncherWindow }: ArchitectIpcOptions): void {
  ipcMain.handle('architect:getInfo', (): DaemonResult<ArchitectInfo> => {
    return ok({ name: 'hiveryn', path: '/architects/hiveryn' });
  });

  ipcMain.handle('architect:openLauncher', (): DaemonResult<null> => {
    openLauncherWindow();
    return ok(null);
  });

  ipcMain.handle('architect:closeWindow', (event): DaemonResult<null> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && !window.isDestroyed()) {
      window.close();
    }
    return ok(null);
  });
}
