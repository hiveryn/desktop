import { ipcMain } from 'electron';
import type { CreateTerminalBody, DaemonResult, TerminalInfo } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerTerminalsIpc(): void {
  ipcMain.handle(
    'terminals:list',
    async (_event, sessionId: string): Promise<DaemonResult<TerminalInfo[]>> => {
      const result = await daemonFetch<{ terminals: TerminalInfo[] }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/terminals`,
      );
      if (result.httpStatus === 0 || result.httpStatus === 404) {
        return {
          httpStatus: 200,
          envelope: { data: [], error: null, logs: [], commands: [], meta: { request_id: '' } },
        };
      }
      return {
        httpStatus: result.httpStatus,
        envelope: { ...result.envelope, data: result.envelope.data?.terminals ?? [] },
      };
    },
  );

  ipcMain.handle(
    'terminals:create',
    async (
      _event,
      sessionId: string,
      body: CreateTerminalBody,
    ): Promise<DaemonResult<TerminalInfo>> => {
      return daemonFetch<TerminalInfo>(`/api/sessions/${encodeURIComponent(sessionId)}/terminals`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
  );

  ipcMain.handle(
    'terminals:kill',
    async (_event, sessionId: string, terminalId: string): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(
        `/api/sessions/${encodeURIComponent(sessionId)}/terminals/${encodeURIComponent(terminalId)}`,
        { method: 'DELETE' },
      );
    },
  );
}
