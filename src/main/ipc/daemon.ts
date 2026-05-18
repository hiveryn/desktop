import { ipcMain } from 'electron';
import type { DaemonHealthState } from '../../shared/types';
import * as daemonHealth from '../daemon/health';

export function registerDaemonIpc(): void {
  ipcMain.handle('daemon:health:get', (): DaemonHealthState => {
    return daemonHealth.getState();
  });
}
