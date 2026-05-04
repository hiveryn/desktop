import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';
import type { Theme } from '../shared/types';

let theme: Theme = 'system';

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Forward system theme changes to renderer
  nativeTheme.on('updated', () => {
    if (theme === 'system' && !mainWindow.isDestroyed()) {
      const isDark = nativeTheme.shouldUseDarkColors;
      mainWindow.webContents.send('preferences:theme-change', isDark ? 'dark' : 'light');
    }
  });
}

// Preferences IPC
ipcMain.handle('preferences:getTheme', () => theme);
ipcMain.handle('preferences:setTheme', (_event, value: Theme) => {
  theme = value;
});

// Mock user API — returns the shape of a future REST response
ipcMain.handle('user:getProfile', () => ({
  data: { name: 'Kareem' },
}));

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hiveryn.desktop');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
