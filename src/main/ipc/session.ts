import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import * as sessionManager from '../daemon/session';
import { errorResult, ok } from './results';

export function registerSessionIpc(): void {
  ipcMain.handle(
    'session:connect',
    async (event, sessionId: string, terminalId: string): Promise<DaemonResult<null>> => {
      const result = await sessionManager.connect(event.sender, sessionId, terminalId);
      return result.ok ? ok(null) : errorResult('SESSION_ERROR', result.message);
    },
  );

  ipcMain.handle(
    'session:disconnect',
    async (_event, sessionId?: string, terminalId?: string): Promise<DaemonResult<null>> => {
      sessionManager.disconnect(_event.sender.id, sessionId, terminalId);
      return ok(null);
    },
  );

  ipcMain.on('session:send', (event, sessionId: string, terminalId: string, data: string) => {
    sessionManager.send(event.sender.id, sessionId, terminalId, data);
  });

  ipcMain.on(
    'session:resize',
    (event, sessionId: string, terminalId: string, cols: number, rows: number) => {
      sessionManager.resize(event.sender.id, sessionId, terminalId, cols, rows);
    },
  );
}
