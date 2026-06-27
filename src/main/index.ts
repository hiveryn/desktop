import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, Menu, shell } from 'electron';
import * as daemonHealth from './daemon/health';
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

function configureWindow(window: BrowserWindow): void {
  window.on('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });
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
    launcherWindow.focus();
    return launcherWindow;
  }

  launcherWindow = new BrowserWindow({
    width: 680,
    height: 480,
    resizable: false,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    // Center the traffic lights in the 36px appbar (--appbar-height); see architect window.
    trafficLightPosition: { x: 12, y: 12 },
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
    existing.focus();
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
    // Vertically center the traffic lights in the 36px appbar (--appbar-height):
    // y = (36 - 12px button) / 2. Keep in sync if the appbar height changes.
    trafficLightPosition: { x: 12, y: 12 },
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
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId(
    IS_DESKTOP_DEVELOPMENT ? 'com.hiveryn.desktop.dev' : 'com.hiveryn.desktop',
  );

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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // When the GPU process crashes, Chromium auto-restarts it (~100–500ms).
  // After restart, WebGL contexts are gone and canvas 2D may be blank until
  // xterm re-renders. Notify all renderer windows after a 1s delay (enough
  // for the new GPU process to be ready) so they can recreate their surfaces.
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return;
    setTimeout(() => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('app:gpu-process-crashed');
        }
      }
    }, 1000);
  });

  createLauncherWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
  });
});

app.on('will-quit', () => {
  daemonHealth.stop();
  shutdownDesktopLogging();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
