import { ipcMain } from 'electron';
import type { BrowserViewBounds, DaemonResult } from '../../shared/types';
import * as browserView from '../browserView';
import { ok } from './results';

// Native WebContentsView lifecycle for browser tabs. Pure Electron — no daemon
// call (tab STATE mutations route through the daemon REST endpoints in
// ipc/tabs.ts; this module only drives the native overlay). Modeled on ipc/tray.ts.
export function registerBrowserViewIpc(): void {
  ipcMain.handle(
    'browser:ensure',
    (event, sessionId: string, tabId: string, target: string): DaemonResult<null> => {
      browserView.ensure(event.sender.id, sessionId, tabId, target);
      return ok(null);
    },
  );

  ipcMain.handle('browser:setActive', (_event, tabId: string): DaemonResult<null> => {
    browserView.setActive(tabId);
    return ok(null);
  });

  ipcMain.handle('browser:detach', (_event, tabId: string): DaemonResult<null> => {
    browserView.detach(tabId);
    return ok(null);
  });

  ipcMain.handle('browser:navigate', (_event, tabId: string, url: string): DaemonResult<null> => {
    browserView.navigate(tabId, url);
    return ok(null);
  });

  ipcMain.handle('browser:back', (_event, tabId: string): DaemonResult<null> => {
    browserView.goBack(tabId);
    return ok(null);
  });

  ipcMain.handle('browser:forward', (_event, tabId: string): DaemonResult<null> => {
    browserView.goForward(tabId);
    return ok(null);
  });

  ipcMain.handle('browser:reload', (_event, tabId: string): DaemonResult<null> => {
    browserView.reload(tabId);
    return ok(null);
  });

  ipcMain.handle('browser:destroy', (_event, tabId: string): DaemonResult<null> => {
    browserView.destroy(tabId);
    return ok(null);
  });

  // High-frequency bounds sync (ResizeObserver / layout changes) — fire-and-forget,
  // no round-trip, mirroring session:send/resize.
  ipcMain.on('browser:bounds', (_event, tabId: string, bounds: BrowserViewBounds) => {
    browserView.setBounds(tabId, bounds);
  });
}
