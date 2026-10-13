import type {
  ActionDefinition,
  ActionList,
  ActionRun,
  LaunchActionRequest,
  LaunchActionResult,
} from '@hiveryn/shared/domain';
import { type BrowserWindow, ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import * as actionEvents from '../daemon/action-events';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, ok, withData, withNullData } from './results';

interface ActionsIpcOptions {
  openActionsWindow: () => BrowserWindow;
}

// Launching starts an agent (setup, PTY, MCP config) — for an Action
// registered on an SSH machine, over many SSH round trips like a remote
// worker — so it outlasts the default request bound: the daemon bounds the
// agent launch at 2 minutes, after inspecting the checkout (30 s at most).
const LAUNCH_TIMEOUT_MS = 180_000;
// Stopping a remote execution first confirms its remote agent stopped, which
// the daemon bounds at 2 minutes.
const CANCEL_TIMEOUT_MS = 150_000;

export function registerActionsIpc({ openActionsWindow }: ActionsIpcOptions): void {
  // `sessionId` (the command palette's running-execution rows) asks the window
  // to land on that execution's session tab; without it the window just opens
  // or focuses wherever it was, so the home stays reachable.
  ipcMain.handle('actions:open-window', (_event, sessionId?: string): DaemonResult<null> => {
    const window = openActionsWindow();
    if (!sessionId) return ok(null);
    const send = (): void => {
      window.webContents.send('actions:open-session', sessionId);
    };
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', send);
    } else {
      send();
    }
    return ok(null);
  });

  ipcMain.handle('actions:list', async (): Promise<DaemonResult<ActionList>> => {
    const result = await daemonFetch<ActionList>('/api/actions');
    if (result.envelope.error) return withNullData(result);
    if (!Array.isArray(result.envelope.data?.actions)) {
      return invalidDaemonResponse('actions:list returned missing actions array');
    }
    return result;
  });

  ipcMain.handle(
    'actions:get',
    (_event, name: string): Promise<DaemonResult<ActionDefinition>> =>
      daemonFetch<ActionDefinition>(`/api/actions/${encodeURIComponent(name)}`),
  );

  ipcMain.handle(
    'actions:launch',
    (
      _event,
      name: string,
      request: LaunchActionRequest,
    ): Promise<DaemonResult<LaunchActionResult>> =>
      daemonFetch<LaunchActionResult>(
        `/api/actions/${encodeURIComponent(name)}/runs`,
        { method: 'POST', body: JSON.stringify(request) },
        { timeoutMs: LAUNCH_TIMEOUT_MS },
      ),
  );

  ipcMain.handle(
    'actions:runs',
    async (_event, action?: string, limit?: number): Promise<DaemonResult<ActionRun[]>> => {
      const query = new URLSearchParams();
      if (action) query.set('action', action);
      if (limit) query.set('limit', String(limit));
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      const result = await daemonFetch<{ runs: ActionRun[] }>(`/api/action-runs${suffix}`);
      if (result.envelope.error) return withNullData(result);
      if (!Array.isArray(result.envelope.data?.runs)) {
        return invalidDaemonResponse('actions:runs returned missing runs array');
      }
      return withData(result, result.envelope.data.runs);
    },
  );

  ipcMain.handle(
    'actions:run',
    (_event, id: string): Promise<DaemonResult<ActionRun>> =>
      daemonFetch<ActionRun>(`/api/action-runs/${encodeURIComponent(id)}`),
  );

  ipcMain.handle(
    'actions:cancel',
    (_event, id: string): Promise<DaemonResult<ActionRun>> =>
      daemonFetch<ActionRun>(
        `/api/action-runs/${encodeURIComponent(id)}/cancel`,
        { method: 'POST' },
        { timeoutMs: CANCEL_TIMEOUT_MS },
      ),
  );

  ipcMain.handle('actions:events:subscribe', (event): DaemonResult<null> => {
    actionEvents.subscribe(event.sender);
    return ok(null);
  });

  ipcMain.handle('actions:events:unsubscribe', (event): DaemonResult<null> => {
    actionEvents.unsubscribe(event.sender.id);
    return ok(null);
  });
}
