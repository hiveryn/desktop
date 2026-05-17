import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import { registerIpc } from './ipc';
import { initializeDesktopLogging, shutdownDesktopLogging } from './logging';

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

nativeTheme.on('updated', () => {
  const isDark = nativeTheme.shouldUseDarkColors;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('preferences:theme-change', isDark ? 'dark' : 'light');
    }
  }
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hiveryn.desktop');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createLauncherWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
  });
});

app.on('will-quit', () => {
  shutdownDesktopLogging();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
