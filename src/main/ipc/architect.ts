import { ipcMain } from 'electron';
import type { ArchitectInfo, DaemonResult } from '../../shared/types';

interface ArchitectIpcOptions {
  openLauncherWindow: () => void;
}

function ok<T>(data: T): DaemonResult<T> {
  return {
    httpStatus: 200,
    envelope: { data, error: null, logs: [], commands: [], meta: { request_id: '' } },
  };
}

export function registerArchitectIpc({ openLauncherWindow }: ArchitectIpcOptions): void {
  ipcMain.handle('architect:getInfo', (): DaemonResult<ArchitectInfo> => {
    return ok({ name: 'hiveryn', path: '/architects/hiveryn' });
  });

  ipcMain.handle('architect:openLauncher', (): DaemonResult<null> => {
    openLauncherWindow();
    return ok(null);
  });
}
