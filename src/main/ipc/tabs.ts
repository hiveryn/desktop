import type { BrowserTabInfo, PreviewBrowserTabParams, SessionTab } from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, withNullData } from './results';

export function registerTabsIpc(): void {
  ipcMain.handle(
    'tabs:list',
    async (_event, sessionId: string): Promise<DaemonResult<SessionTab[]>> => {
      const result = await daemonFetch<SessionTab[]>(
        `/api/sessions/${encodeURIComponent(sessionId)}/tabs`,
      );
      if (result.envelope.error) {
        return withNullData(result);
      }
      if (!Array.isArray(result.envelope.data)) {
        return invalidDaemonResponse(
          `tabs:list returned non-array payload for session ${sessionId}`,
        );
      }
      return {
        httpStatus: result.httpStatus,
        envelope: { ...result.envelope, data: result.envelope.data },
      };
    },
  );

  // Create a browser tab (empty tab_id) OR navigate an existing one (tab_id set).
  // The daemon owns tab state and re-emits `tab_changed`, so the renderer refetches
  // the tab list afterwards rather than mutating local state.
  ipcMain.handle(
    'tabs:createBrowserTab',
    async (
      _event,
      sessionId: string,
      params: PreviewBrowserTabParams,
    ): Promise<DaemonResult<BrowserTabInfo>> => {
      return daemonFetch<BrowserTabInfo>(
        `/api/sessions/${encodeURIComponent(sessionId)}/browser-tabs`,
        { method: 'POST', body: JSON.stringify(params) },
      );
    },
  );

  ipcMain.handle(
    'tabs:closeBrowserTab',
    async (_event, sessionId: string, tabId: string): Promise<DaemonResult<null>> => {
      return daemonFetch<null>(
        `/api/sessions/${encodeURIComponent(sessionId)}/browser-tabs/${encodeURIComponent(tabId)}`,
        { method: 'DELETE' },
      );
    },
  );
}
