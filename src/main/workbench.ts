import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { app, BrowserWindow, shell } from 'electron';
import type { WorkbenchRequest } from '../shared/types';

// The one Hiveryn window. Every architect and worker session is shown inside it;
// the session sidebar switches between them in place. Closing it does not quit on
// macOS (the tray and the global shortcut reopen it).

const rendererEntry = join(__dirname, '../renderer/index.html');
const preloadEntry = join(__dirname, '../preload/index.js');

const WORKBENCH_REQUEST_CHANNEL = 'workbench:request';

let workbenchWindow: BrowserWindow | null = null;

// Bring the window to the front. On macOS, show()/focus() alone won't raise a
// window while another app is frontmost — the app itself must be activated first.
// steal: true pulls focus from the active app, which is the case for the global
// shortcut, the tray icon and a notification click.
function raiseWindow(window: BrowserWindow): void {
  if (process.platform === 'darwin') {
    app.focus({ steal: true });
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
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

function createWorkbenchWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 880,
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
      preload: preloadEntry,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.on('ready-to-show', () => raiseWindow(window));
  window.on('closed', () => {
    if (workbenchWindow === window) workbenchWindow = null;
  });

  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
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

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(rendererEntry);
  }
  return window;
}

// The workbench window, created when none is open.
export function openWorkbench(): BrowserWindow {
  if (workbenchWindow && !workbenchWindow.isDestroyed()) {
    raiseWindow(workbenchWindow);
    return workbenchWindow;
  }
  workbenchWindow = createWorkbenchWindow();
  return workbenchWindow;
}

export function getWorkbenchWindow(): BrowserWindow | null {
  return workbenchWindow && !workbenchWindow.isDestroyed() ? workbenchWindow : null;
}

// Raise the window and hand the renderer a request, after its page has loaded
// when the window was just created.
function request(payload: WorkbenchRequest): void {
  const window = openWorkbench();
  const send = (): void => {
    if (!window.isDestroyed()) window.webContents.send(WORKBENCH_REQUEST_CHANNEL, payload);
  };
  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

// The global shortcut and the tray icon: bring the window forward with the
// sidebar expanded and its search focused.
export function revealSidebarSearch(): void {
  request({ type: 'reveal-sidebar-search' });
}

// A notification click: select the session that raised it.
export function selectWorkbenchSession(architectKey: string, sessionId: string): void {
  request({ type: 'select-session', architectKey, sessionId });
}
