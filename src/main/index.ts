import { join } from 'node:path';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, globalShortcut, Menu } from 'electron';
import * as daemonHealth from './daemon/health';
import { loadAndRegisterGlobalShortcut } from './globalShortcut';
import { configureIntentNotifications } from './intentNotifications';
import { registerIpc } from './ipc';
import { initializeDesktopLogging, shutdownDesktopLogging } from './logging';
import { DESKTOP_RUNTIME_HOME, IS_DESKTOP_DEVELOPMENT } from './runtime';
import { createTray, stopTrayStatusPoll } from './tray';
import { getWorkbenchWindow, openWorkbench, selectWorkbenchSession } from './workbench';

app.setPath('userData', join(DESKTOP_RUNTIME_HOME, 'desktop'));
if (IS_DESKTOP_DEVELOPMENT) {
  app.setName('Hiveryn Dev');
}

initializeDesktopLogging();

registerIpc();

// Clicking an intent's OS notification selects its session in the workbench; a
// toast is suppressed only while that intent's card is actually on screen.
configureIntentNotifications({
  focusSession: selectWorkbenchSession,
  getWindow: getWorkbenchWindow,
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId(
    IS_DESKTOP_DEVELOPMENT ? 'com.hiveryn.desktop.dev' : 'com.hiveryn.desktop',
  );

  // A bare Electron binary (`make prod` — electron-vite preview, no .app bundle)
  // launches without a foreground activation policy, so it never registers in
  // cmd+tab or the dock. This also holds for a *packaged* build when it's
  // launched by exec'ing the Mach-O binary directly (as `make prod-local`
  // does) instead of via `open`/LaunchServices/Finder: without the
  // LaunchServices handshake, AppKit falls back to an accessory-like policy
  // even though Info.plist has no LSUIElement key. Force 'regular' on every
  // darwin launch — packaged or not — so the app is always switchable and
  // dock-visible. (Name/icon still come from the bundle, so unpackaged shows
  // as "Electron".)
  if (process.platform === 'darwin') {
    app.setActivationPolicy('regular');
    void app.dock?.show();
  }

  // On macOS, Electron's default Window menu binds Cmd+M to "Minimize Window",
  // which fires before any renderer keydown event — preventing the renderer from
  // claiming Cmd+M for pane maximize. Replace the default menu with a version
  // that omits the minimize entry so the renderer gets the key unobstructed.
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        {
          label: 'Window',
          submenu: [{ role: 'zoom' }, { role: 'close' }, { type: 'separator' }, { role: 'front' }],
        },
      ]),
    );
  }

  daemonHealth.start();

  // Persistent menu bar icon with live agent counts; clicking it brings the
  // workbench forward with the sidebar search focused.
  createTray();

  // OS-global shortcut (default ⌥Space) doing the same as the tray icon.
  // Registered in the main process so it works regardless of which app is focused.
  void loadAndRegisterGlobalShortcut();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // When the GPU process crashes, Chromium auto-restarts it (~100–500ms).
  // After restart, WebGL contexts are gone and canvas 2D may be blank until
  // xterm re-renders. Notify all renderer windows after a short delay (enough
  // for the new GPU process to be ready) so they can recreate their surfaces.
  //
  // This broadcast is the BACKUP recovery trigger. The primary trigger is each
  // terminal's own `addon.onContextLoss`, which fires the instant the context
  // dies and drives a retry-with-backoff re-attach — so the exact delay here is
  // no longer load-bearing. The broadcast still covers panes that never held a
  // WebGL context (e.g. canvas-2D blanking). Logs (desktop.jsonl) make a future
  // occurrence fully traceable against the renderer-side recovery logs.
  const GPU_CRASH_BROADCAST_DELAY_MS = 1000;
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') {
      // Log non-GPU child-process exits too — useful context when triaging a
      // GPU crash that cascaded from (or alongside) another process dying.
      console.info('[main:child-process] child process gone', {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
      });
      return;
    }
    console.warn('[main:gpu] GPU process gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
    });
    setTimeout(() => {
      let windows = 0;
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('app:gpu-process-crashed');
          windows += 1;
        }
      }
      console.info('[main:gpu] broadcasting app:gpu-process-crashed', {
        windows,
        delayMs: GPU_CRASH_BROADCAST_DELAY_MS,
      });
    }, GPU_CRASH_BROADCAST_DELAY_MS);
  });

  openWorkbench();

  app.on('activate', () => {
    if (!getWorkbenchWindow()) openWorkbench();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  daemonHealth.stop();
  stopTrayStatusPoll();
  shutdownDesktopLogging();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
