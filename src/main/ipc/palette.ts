import { type BrowserWindow, ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { ok } from './results';

interface PaletteIpcOptions {
  openArchitectWindow: (architectKey: string) => BrowserWindow;
}

export function registerPaletteIpc({ openArchitectWindow }: PaletteIpcOptions): void {
  ipcMain.handle(
    'palette:focus-architect',
    (_event, architectKey: string, sessionId?: string): DaemonResult<null> => {
      const window = openArchitectWindow(architectKey);
      // Always send a switch — `null` tells the window to land on the
      // architect's own session tab rather than wherever it last was.
      const send = (): void => {
        window.webContents.send('palette:switch-session', sessionId ?? null);
      };
      if (window.webContents.isLoading()) {
        window.webContents.once('did-finish-load', send);
      } else {
        send();
      }
      return ok(null);
    },
  );
}
