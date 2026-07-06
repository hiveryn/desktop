import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, globalShortcut, Menu, shell } from 'electron';
import * as daemonHealth from './daemon/health';
import { loadAndRegisterGlobalShortcut } from './globalShortcut';
import { registerIpc } from './ipc';
import { initializeDesktopLogging, shutdownDesktopLogging } from './logging';
import { DESKTOP_RUNTIME_HOME, IS_DESKTOP_DEVELOPMENT } from './runtime';
import { createTray } from './tray';

app.setPath('userData', join(DESKTOP_RUNTIME_HOME, 'desktop'));
if (IS_DESKTOP_DEVELOPMENT) {
  app.setName('Hiveryn Dev');
}

const rendererEntry = join(__dirname, '../renderer/index.html');
let launcherWindow: BrowserWindow | null = null;
const architectWindows = new Map<string, BrowserWindow>();

initializeDesktopLogging();

// Bring a window to the front. On macOS, window.show()/focus() alone won't raise
// a window when another app is frontmost — the app itself must be activated first.
// steal: true pulls focus even from the currently-active app, which is exactly the
// case after selecting a target from the global (⌥Space) palette while another app
// is in front.
function raiseWindow(window: BrowserWindow): void {
  if (process.platform === 'darwin') {
    app.focus({ steal: true });
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function configureWindow(window: BrowserWindow): void {
  window.on('ready-to-show', () => {
    raiseWindow(window);
  });

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // The renderer is an SPA — in-window navigation (e.g. clicking a plain
  // anchor in rendered markdown) is a bug. Block everything except reloads of
  // the renderer itself (Vite full-reload uses location.reload(), which fires
  // will-navigate too); hand web/mail links to the OS default handler.
  window.webContents.on('will-navigate', (event, url) => {
    if (isSelfNavigation(url, window.webContents.getURL())) return;
    event.preventDefault();
    if (/^(https?|mailto):/.test(url)) {
      void shell.openExternal(url);
    }
  });
}

function isSelfNavigation(url: string, currentUrl: string): boolean {
  let target: URL;
  let current: URL;
  try {
    target = new URL(url);
    current = new URL(currentUrl);
  } catch {
    return false;
  }
  // file: URLs all share the opaque 'null' origin, so compare paths — only a
  // reload of the packaged renderer entry itself counts as self.
  if (target.protocol === 'file:') {
    return current.protocol === 'file:' && target.pathname === current.pathname;
  }
  return target.origin !== 'null' && target.origin === current.origin;
}

function loadRoute(window: BrowserWindow, route: string): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${route}`);
  } else {
    window.loadFile(rendererEntry, { hash: route });
  }
}

function createLauncherWindow(): BrowserWindow {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    raiseWindow(launcherWindow);
    return launcherWindow;
  }

  launcherWindow = new BrowserWindow({
    width: 680,
    height: 480,
    resizable: false,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    // Center the traffic lights in the ~40px appbar (--appbar-height = 36 × --ui-scale 1.1);
    // see architect window for the math.
    trafficLightPosition: { x: 12, y: 14 },
    // Matches --theme-background; prevents a white flash before the renderer paints.
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });

  configureWindow(launcherWindow);
  loadRoute(launcherWindow, '/launcher');
  return launcherWindow;
}

function createArchitectWindow(architectKey: string): BrowserWindow {
  const existing = architectWindows.get(architectKey);
  if (existing && !existing.isDestroyed()) {
    raiseWindow(existing);
    return existing;
  }

  const architectWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    resizable: true,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    // Vertically center the traffic lights in the appbar (--appbar-height = 36 ×
    // --ui-scale 1.1 ≈ 40px): y = (40 - 12px button) / 2 ≈ 14. The lights are native
    // chrome in DIP and don't scale with the CSS, so only y moves. Keep in sync if the
    // appbar height or --ui-scale changes.
    trafficLightPosition: { x: 12, y: 14 },
    // Matches --theme-background; prevents a white flash before the renderer paints.
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  architectWindows.set(architectKey, architectWindow);
  architectWindow.on('closed', () => {
    architectWindows.delete(architectKey);
  });

  configureWindow(architectWindow);
  loadRoute(architectWindow, `/architect/${encodeURIComponent(architectKey)}`);
  return architectWindow;
}

registerIpc({
  openArchitectWindow: createArchitectWindow,
  openLauncherWindow: createLauncherWindow,
  isLauncherWindow: (window) => window === launcherWindow,
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId(
    IS_DESKTOP_DEVELOPMENT ? 'com.hiveryn.desktop.dev' : 'com.hiveryn.desktop',
  );

  // A bare Electron binary (`make prod` — electron-vite preview, no .app bundle)
  // launches without a foreground activation policy, so it never registers in
  // cmd+tab or the dock. A packaged build inherits 'regular' from its Info.plist;
  // force it here for unpackaged runs so the app is switchable and dock-visible.
  // (Name/icon still come from the bundle, so unpackaged shows as "Electron".)
  if (process.platform === 'darwin' && !app.isPackaged) {
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

  // Persistent menu bar icon that opens the architect/session palette popover.
  createTray();

  // OS-global shortcut (default ⌥Space) that summons the same palette window
  // centered on the active display. Registered in the main process so it works
  // regardless of which app is focused.
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

  createLauncherWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  daemonHealth.stop();
  shutdownDesktopLogging();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
