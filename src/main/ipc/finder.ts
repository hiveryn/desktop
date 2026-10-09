import { ipcMain, shell } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { ok } from './results';

// Reveal a local path in Finder — the Action output folder and ticket path
// references. A pure Electron shell call; no daemon involved.
export function registerFinderIpc(): void {
  ipcMain.handle('finder:reveal', async (_event, path: string): Promise<DaemonResult<null>> => {
    shell.showItemInFolder(path);
    return ok(null);
  });
}
