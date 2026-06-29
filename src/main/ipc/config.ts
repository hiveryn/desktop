import { ipcMain } from 'electron';
import type { DaemonResult, DesktopConfig } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { loadAndRegisterGlobalShortcut } from '../globalShortcut';
import { ok } from './results';

export function registerConfigIpc(): void {
  ipcMain.handle(
    'config:shortcuts',
    async (): Promise<DaemonResult<Record<string, Record<string, string>>>> => {
      return daemonFetch<Record<string, Record<string, string>>>('/api/config/shortcuts');
    },
  );

  ipcMain.handle('config:desktop', async (): Promise<DaemonResult<DesktopConfig>> => {
    return daemonFetch<DesktopConfig>('/api/config/desktop');
  });

  // Re-read the OS-global palette binding from config and re-register it. The
  // renderer calls this on its config-refresh signal (mount + window focus) so
  // edits to shortcuts.yaml take effect without a restart.
  ipcMain.handle('globalShortcut:reload', async (): Promise<DaemonResult<null>> => {
    await loadAndRegisterGlobalShortcut();
    return ok(null);
  });
}
