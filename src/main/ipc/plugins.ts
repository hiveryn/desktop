import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { ok } from './results';

// Stub implementation: plugin calls are forwarded to the daemon which routes
// them to the appropriate tabplugin. Until the daemon-side routing is in place,
// return a stub success response so the renderer plugin layer can be wired up.
export function registerPluginsIpc(): void {
  ipcMain.handle(
    'plugins:call',
    async (
      _event,
      pluginName: string,
      fn: string,
      args: Record<string, unknown>,
    ): Promise<DaemonResult<unknown>> => {
      void pluginName;
      void fn;
      void args;
      return ok({ acknowledged: true, plugin: pluginName, function: fn });
    },
  );
}
