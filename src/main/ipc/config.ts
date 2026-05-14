import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerConfigIpc(): void {
  ipcMain.handle(
    'config:shortcuts',
    async (): Promise<DaemonResult<Record<string, Record<string, string>>>> => {
      return daemonFetch<Record<string, Record<string, string>>>('/api/config/shortcuts');
    },
  );
}
