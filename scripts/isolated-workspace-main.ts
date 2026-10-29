// Minimal hidden Electron bootstrap for integration checks. It uses production
// IPC, preload and renderer code without installing OS integrations.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { app, BrowserWindow } from 'electron';
import * as health from '../src/main/daemon/health';
import { registerIpc } from '../src/main/ipc';

const root = process.env.HIVERYN_ISOLATED_RUN;
if (
  !root ||
  readFileSync(join(root, 'owned-isolation'), 'utf8').trim() !== 'workspace-migration-ticket'
) {
  throw new Error('An explicitly owned isolated run directory is required');
}
if (resolve(process.env.HIVERYN_HOME ?? '') !== join(root, 'home')) {
  throw new Error('HIVERYN_HOME must be the isolated run home');
}
const url = new URL(process.env.HIVERYN_DAEMON_URL ?? '');
if (url.hostname !== '127.0.0.1' || !url.port || ['4200', '4201'].includes(url.port)) {
  throw new Error('An isolated loopback daemon port is required');
}
app.setName('Hiveryn Workspace Verification');
app.setPath('userData', join(root, 'electron-user-data'));
if (process.platform === 'darwin') app.setActivationPolicy('prohibited');

function open(): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

void app.whenReady().then(() => {
  registerIpc();
  health.start();
  open();
});
app.on('will-quit', () => health.stop());
app.on('window-all-closed', () => app.quit());
