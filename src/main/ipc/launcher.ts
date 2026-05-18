import { BrowserWindow, ipcMain } from 'electron';
import type { Architect, DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { withData } from './results';

interface LauncherIpcOptions {
  openArchitectWindow: (architectKey: string) => BrowserWindow;
}

function closeSenderWindow(sender: Electron.WebContents): void {
  const window = BrowserWindow.fromWebContents(sender);
  if (window && !window.isDestroyed()) {
    window.close();
  }
}

export function registerLauncherIpc({ openArchitectWindow }: LauncherIpcOptions): void {
  ipcMain.handle(
    'launcher:open-architect',
    async (event, architectKey: string): Promise<DaemonResult<null>> => {
      const result = await daemonFetch<Architect>(
        `/api/architects/${encodeURIComponent(architectKey)}`,
      );
      if (result.envelope.error) {
        return withData(result, null);
      }

      openArchitectWindow(architectKey);
      closeSenderWindow(event.sender);
      return withData(result, null);
    },
  );
}
