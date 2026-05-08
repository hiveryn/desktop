import { BrowserWindow, ipcMain } from 'electron';
import type { Architect, DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

interface LauncherIpcOptions {
  openArchitectWindow: (architectId: string) => BrowserWindow;
}

function withData<TInput, TOutput>(
  result: DaemonResult<TInput>,
  data: TOutput | null,
): DaemonResult<TOutput> {
  return {
    httpStatus: result.httpStatus,
    envelope: {
      ...result.envelope,
      data,
    },
  };
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
    async (event, architectId: string): Promise<DaemonResult<null>> => {
      const result = await daemonFetch<Architect>(
        `/api/architects/${encodeURIComponent(architectId)}`,
      );
      if (result.envelope.error) {
        return withData(result, null);
      }

      openArchitectWindow(architectId);
      closeSenderWindow(event.sender);
      return withData(result, null);
    },
  );

  ipcMain.handle(
    'launcher:register-architect',
    async (_event, path: string, title: string): Promise<DaemonResult<{ id: string }>> => {
      const result = await daemonFetch<Architect>('/api/architects', {
        method: 'POST',
        body: JSON.stringify({ path, title }),
      });

      const architectId = result.envelope.data?.id;
      if (result.envelope.error || !architectId) {
        return withData<Architect, { id: string }>(result, null);
      }

      openArchitectWindow(architectId);
      closeSenderWindow(_event.sender);
      return withData(result, { id: architectId });
    },
  );
}
