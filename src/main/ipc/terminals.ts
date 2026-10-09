import type { CreateTerminalParams, TerminalInfo, TerminalWorkdir } from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, withNullData } from './results';

// Opening a remote repository terminal creates its tmux server over SSH. The
// daemon bounds creation at 45 s plus up to 30 s of cleanup when it fails, and
// finishes either way once started; this bound sits beyond both, so the
// daemon's own outcome is what the user sees.
const TERMINAL_CREATE_TIMEOUT_MS = 90_000;

export function registerTerminalsIpc(): void {
  ipcMain.handle(
    'terminals:listWorkdirs',
    async (_event, sessionId: string): Promise<DaemonResult<TerminalWorkdir[]>> =>
      daemonFetch<TerminalWorkdir[]>(
        `/api/sessions/${encodeURIComponent(sessionId)}/terminal-workdirs`,
      ),
  );
  ipcMain.handle(
    'terminals:list',
    async (_event, sessionId: string): Promise<DaemonResult<TerminalInfo[]>> => {
      const result = await daemonFetch<{ terminals: TerminalInfo[] }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/terminals`,
      );
      if (result.envelope.error) {
        return withNullData(result);
      }
      if (!Array.isArray(result.envelope.data?.terminals)) {
        return invalidDaemonResponse(
          `terminals:list returned missing terminals array for session ${sessionId}`,
        );
      }
      return {
        httpStatus: result.httpStatus,
        envelope: { ...result.envelope, data: result.envelope.data.terminals },
      };
    },
  );

  ipcMain.handle(
    'terminals:create',
    async (
      _event,
      sessionId: string,
      body: CreateTerminalParams,
    ): Promise<DaemonResult<TerminalInfo>> => {
      const result = await daemonFetch<TerminalInfo>(
        `/api/sessions/${encodeURIComponent(sessionId)}/terminals`,
        { method: 'POST', body: JSON.stringify(body) },
        { timeoutMs: TERMINAL_CREATE_TIMEOUT_MS },
      );
      const error = result.envelope.error;
      if (error?.code === 'TIMEOUT') {
        // A timeout does not prove no terminal was created.
        error.message +=
          '. The daemon finishes or cleans up the terminal on its own: it appears as a tab if it opened.';
      }
      return result;
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
