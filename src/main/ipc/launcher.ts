import { BrowserWindow, ipcMain } from 'electron';
import type { Architect, DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { withData } from './results';

interface LauncherIpcOptions {
  openArchitectWindow: (architectKey: string) => BrowserWindow;
  isLauncherWindow: (window: BrowserWindow) => boolean;
}

export function registerLauncherIpc({
  openArchitectWindow,
  isLauncherWindow,
}: LauncherIpcOptions): void {
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
      // Only the launcher window self-closes after spawning an architect. The same
      // channel is also invoked from the command palette inside an architect window
      // and from the tray popup — those senders must stay open.
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow && !senderWindow.isDestroyed() && isLauncherWindow(senderWindow)) {
        senderWindow.close();
      }
      return withData(result, null);
    },
  );
}
