import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import * as sessionManager from '../daemon/session';

function ok(): DaemonResult<null> {
  return {
    httpStatus: 200,
    envelope: { data: null, error: null, logs: [], commands: [], meta: { request_id: '' } },
  };
}

function sessionError(message: string): DaemonResult<null> {
  return {
    httpStatus: 500,
    envelope: {
      data: null,
      error: { code: 'SESSION_ERROR', message, details: null, stacktrace: '' },
      logs: [],
      commands: [],
      meta: { request_id: '' },
    },
  };
}

export function registerSessionIpc(): void {
  ipcMain.handle(
    'session:connect',
    async (event, sessionId: string, wsUrl: string): Promise<DaemonResult<null>> => {
      const result = await sessionManager.connect(event.sender, sessionId, wsUrl);
      return result.ok ? ok() : sessionError(result.message);
    },
  );

  ipcMain.handle('session:disconnect', (event): DaemonResult<null> => {
    sessionManager.disconnect(event.sender.id);
    return ok();
  });

  ipcMain.on('session:send', (event, data: string) => {
    sessionManager.send(event.sender.id, data);
  });

  ipcMain.on('session:resize', (event, cols: number, rows: number) => {
    sessionManager.resize(event.sender.id, cols, rows);
  });
}
