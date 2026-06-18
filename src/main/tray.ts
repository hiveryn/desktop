import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { app, BrowserWindow, nativeImage, type Rectangle, screen, Tray } from 'electron';
import { IS_DESKTOP_DEVELOPMENT } from './runtime';

// Fixed width; the renderer measures its content and asks us to resize the
// height to fit (capped at TRAY_MAX_HEIGHT, after which the list scrolls).
const TRAY_WIDTH = 380;
const TRAY_INITIAL_HEIGHT = 420;
const TRAY_MAX_HEIGHT = 520;
// Gap between the menu bar icon and the top of the popover.
const TRAY_GAP = 6;

const rendererEntry = join(__dirname, '../renderer/index.html');

let tray: Tray | null = null;
let trayWindow: BrowserWindow | null = null;

function resolveTrayIconPath(): string {
  // In dev, __dirname is out/main → ../../resources points at the repo root.
  // When packaged, the icon is copied into the app's Resources via extraResources.
  return app.isPackaged
    ? join(process.resourcesPath, 'trayTemplate.png')
    : join(__dirname, '../../resources/trayTemplate.png');
}

function loadTrayRoute(window: BrowserWindow): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/tray`);
  } else {
    window.loadFile(rendererEntry, { hash: '/tray' });
  }
}

function createTrayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: TRAY_WIDTH,
    height: TRAY_INITIAL_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: true,
    alwaysOnTop: true,
    // An NSPanel can take key focus (so the search input works) without
    // activating the rest of the app's windows.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Dismiss when focus leaves the popover (e.g. clicking a row focuses an
  // architect window, or the user clicks elsewhere).
  window.on('blur', () => {
    if (!window.webContents.isDevToolsFocused()) window.hide();
  });

  window.on('closed', () => {
    trayWindow = null;
  });

  loadTrayRoute(window);
  return window;
}

function positionWindow(window: BrowserWindow, trayBounds: Rectangle): void {
  const { width } = window.getBounds();
  const display = screen.getDisplayMatching(trayBounds);
  const workArea = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
  // Keep the popover fully on-screen horizontally.
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - width;
  x = Math.max(minX, Math.min(x, maxX));

  const y = Math.round(trayBounds.y + trayBounds.height + TRAY_GAP);
  window.setPosition(x, y, false);
}

function showTrayWindow(trayBounds: Rectangle): void {
  if (!trayWindow || trayWindow.isDestroyed()) {
    trayWindow = createTrayWindow();
  }
  positionWindow(trayWindow, trayBounds);
  trayWindow.show();
  trayWindow.focus();
  // Tell the renderer it just became visible so it refreshes data, resets the
  // query, and focuses the search input.
  trayWindow.webContents.send('tray:shown');
}

function toggleTrayWindow(trayBounds: Rectangle): void {
  if (trayWindow && !trayWindow.isDestroyed() && trayWindow.isVisible()) {
    trayWindow.hide();
    return;
  }
  showTrayWindow(trayBounds);
}

export function createTray(): void {
  if (tray) return;

  const icon = nativeImage.createFromPath(resolveTrayIconPath());
  icon.setTemplateImage(true);

  const created = new Tray(icon);
  tray = created;
  // Distinguish the dev tray from a concurrently-running prod build: same glyph,
  // but a "dev" title beside the icon and a clearer tooltip.
  created.setToolTip(IS_DESKTOP_DEVELOPMENT ? 'Hiveryn Dev' : 'Hiveryn');
  if (IS_DESKTOP_DEVELOPMENT) created.setTitle(' dev');
  created.on('click', () => toggleTrayWindow(created.getBounds()));
  created.on('right-click', () => toggleTrayWindow(created.getBounds()));

  // Create the window up front (hidden) so the first open is instant.
  trayWindow = createTrayWindow();
}

export function hideTrayWindow(): void {
  if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide();
}

export function setTrayWindowHeight(height: number): void {
  if (!trayWindow || trayWindow.isDestroyed()) return;
  const clamped = Math.max(1, Math.min(Math.round(height), TRAY_MAX_HEIGHT));
  const { width } = trayWindow.getBounds();
  trayWindow.setBounds({ width, height: clamped }, false);
}
