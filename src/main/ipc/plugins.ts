import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerPluginsIpc(): void {
  ipcMain.handle(
    'plugins:call',
    async (
      _event,
      sessionId: string,
      pluginType: string,
      fn: string,
      args: Record<string, unknown>,
    ): Promise<DaemonResult<unknown>> => {
      return daemonFetch<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/plugins/call`, {
        method: 'POST',
        body: JSON.stringify({ type: pluginType, fn, args }),
      });
    },
  );
}
