import { ipcMain } from 'electron';
import type { ArchitectInfo, DaemonResult } from '../../shared/types';

function ok<T>(data: T): DaemonResult<T> {
  return {
    httpStatus: 200,
    envelope: { data, error: null, logs: [], commands: [], meta: { request_id: '' } },
  };
}

export function registerArchitectIpc(): void {
  ipcMain.handle('architect:getInfo', (): DaemonResult<ArchitectInfo> => {
    return ok({ name: 'hiveryn', path: '/architects/hiveryn' });
  });

  ipcMain.handle('architect:openLauncher', (): DaemonResult<null> => {
    console.log('[architect] open launcher (stub)');
    return ok(null);
  });
}
