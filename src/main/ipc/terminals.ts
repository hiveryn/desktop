import { ipcMain } from 'electron';
import type { CreateTerminalBody, DaemonResult, TerminalInfo } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import * as sessionManager from '../daemon/session';

export function registerTerminalsIpc(): void {
  ipcMain.handle(
    'terminals:list',
    async (_event, sessionId: string): Promise<DaemonResult<TerminalInfo[]>> => {
      const result = await daemonFetch<{ terminals: { name: string }[] }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/terminals`,
      );
      if (result.httpStatus === 0 || result.httpStatus === 404) {
        return {
          httpStatus: 200,
          envelope: {
            data: [{ name: 'main', ws_url: sessionManager.getWsUrl(sessionId, 'main') }],
            error: null,
            logs: [],
            commands: [],
            meta: { request_id: '' },
          },
        };
      }
      const rawTerminals = result.envelope.data?.terminals ?? [];
      const terminals: TerminalInfo[] = rawTerminals.map((t) => ({
        name: t.name,
        ws_url: sessionManager.getWsUrl(sessionId, t.name),
      }));
      return { httpStatus: result.httpStatus, envelope: { ...result.envelope, data: terminals } };
    },
  );

  ipcMain.handle(
    'terminals:create',
    async (
      _event,
      sessionId: string,
      body: CreateTerminalBody,
    ): Promise<DaemonResult<TerminalInfo>> => {
      const result = await daemonFetch<{ name: string }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/terminals`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      if (result.envelope.error) {
        return result as DaemonResult<TerminalInfo>;
      }
      const name = result.envelope.data?.name ?? body.name;
      const terminal: TerminalInfo = {
        name,
        ws_url: sessionManager.getWsUrl(sessionId, name),
      };
      return { httpStatus: result.httpStatus, envelope: { ...result.envelope, data: terminal } };
    },
  );

  ipcMain.handle(
    'terminals:kill',
    async (_event, sessionId: string, terminalName: string): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(
        `/api/sessions/${encodeURIComponent(sessionId)}/terminals/${encodeURIComponent(terminalName)}`,
        { method: 'DELETE' },
      );
    },
  );
}
