import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { app, BrowserWindow, nativeImage, type Rectangle, screen, Tray } from 'electron';
import type { ArchitectStatus } from '../shared/types';
import { daemonFetch } from './daemon/client';
import { IS_DESKTOP_DEVELOPMENT } from './runtime';

// Fixed width; the renderer measures its content and asks us to resize the
// height to fit (capped at TRAY_MAX_HEIGHT, after which the list scrolls).
// Dimensions track the global --ui-scale (1.1): the popover content scales via
// CSS, so these grow with it to avoid horizontal overflow / vertical clipping.
// The renderer reports height in CSS px, which equals DIP here (no zoom factor),
// so the measured height stays correct without extra conversion.
const TRAY_WIDTH = 418; // 380 × 1.1
const TRAY_INITIAL_HEIGHT = 462; // 420 × 1.1
const TRAY_MAX_HEIGHT = 572; // 520 × 1.1
// Gap between the menu bar icon and the top of the popover.
const TRAY_GAP = 6;

const rendererEntry = join(__dirname, '../renderer/index.html');

// Daemon `SessionRun.AgentStatus` values (internal/domain/session.go). `active`
// = the agent is working; `idle`/`waiting` = it needs the user's attention;
// `stopped` runs never appear in /api/architects/status (it lists only running
// sessions) but are excluded regardless.
const AGENT_STATUS_ACTIVE = 'active';
const AGENT_STATUS_IDLE = 'idle';
const AGENT_STATUS_WAITING = 'waiting';

// How often the main process polls the aggregate status for the tray title. The
// menu-bar count is ambient info, so a relaxed cadence is fine; the TrayPalette
// popover polls separately (faster, only while visible).
const STATUS_POLL_INTERVAL_MS = 3000;

interface ArchitectStatusPayload {
  architects: ArchitectStatus[];
}

interface AgentCounts {
  active: number;
  attention: number;
}

let tray: Tray | null = null;
let trayWindow: BrowserWindow | null = null;
let statusPollTimer: ReturnType<typeof setTimeout> | null = null;

// Tally running architect + worker sessions into working vs needs-attention.
// The architect session's status rides on `architect.status` (null when no
// architect session is running); worker sessions are in `architect.sessions`.
function computeAgentCounts(statuses: ArchitectStatus[]): AgentCounts {
  const counts: AgentCounts = { active: 0, attention: 0 };
  const tally = (agentStatus: string | null): void => {
    if (agentStatus === AGENT_STATUS_ACTIVE) counts.active += 1;
    else if (agentStatus === AGENT_STATUS_IDLE || agentStatus === AGENT_STATUS_WAITING) {
      counts.attention += 1;
    }
  };
  for (const architect of statuses) {
    tally(architect.status);
    for (const session of architect.sessions) tally(session.agent_status);
  }
  return counts;
}

// Build the tray title, e.g. `3 !1` (3 working, 1 waiting). Zeros drop out so
// each part appears independently; nothing running renders no count text. The
// dev-build marker is folded in so it coexists with the counts (` dev 3 !1`).
function renderTrayTitle(counts: AgentCounts): string {
  const parts: string[] = [];
  if (IS_DESKTOP_DEVELOPMENT) parts.push('dev');
  if (counts.active > 0) parts.push(String(counts.active));
  if (counts.attention > 0) parts.push(`!${counts.attention}`);
  // macOS renders the title flush against the icon, so a leading space separates
  // them. Empty string leaves the icon standalone.
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function updateTrayTitle(counts: AgentCounts): void {
  if (tray && !tray.isDestroyed()) tray.setTitle(renderTrayTitle(counts));
}

async function pollAgentCounts(): Promise<void> {
  const result = await daemonFetch<ArchitectStatusPayload>('/api/architects/status');
  // Tolerate a transient/unreachable daemon (restarts are handled elsewhere) by
  // leaving the last title in place, but a 200 with a malformed body is a real
  // invariant break — surface it.
  if (!result.envelope.error) {
    const architects = result.envelope.data?.architects;
    if (!Array.isArray(architects)) {
      throw new Error(
        `architects:status returned missing architects array: ${JSON.stringify(result.envelope.data)}`,
      );
    }
    updateTrayTitle(computeAgentCounts(architects));
  }
  scheduleAgentCountsPoll();
}

function scheduleAgentCountsPoll(): void {
  statusPollTimer = setTimeout(() => {
    void pollAgentCounts().catch((err) => {
      throw err;
    });
  }, STATUS_POLL_INTERVAL_MS);
}

export function stopTrayStatusPoll(): void {
  if (statusPollTimer) {
    clearTimeout(statusPollTimer);
    statusPollTimer = null;
  }
}

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

// Center the palette on the display under the cursor (the "active" display in a
// multi-monitor setup). Sits a bit above the vertical middle, Raycast-style.
function positionCentered(window: BrowserWindow): void {
  const { width, height } = window.getBounds();
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  let x = Math.round(workArea.x + (workArea.width - width) / 2);
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width));

  let y = Math.round(workArea.y + (workArea.height - height) / 3);
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));

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

// Toggle the palette from the OS-global shortcut: same window as the tray
// popover, but centered on the active display instead of anchored to the icon.
export function togglePalette(): void {
  if (trayWindow && !trayWindow.isDestroyed() && trayWindow.isVisible()) {
    trayWindow.hide();
    return;
  }
  if (!trayWindow || trayWindow.isDestroyed()) {
    trayWindow = createTrayWindow();
  }
  positionCentered(trayWindow);
  trayWindow.show();
  trayWindow.focus();
  trayWindow.webContents.send('tray:shown');
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
  // Seed the title (dev marker, no counts yet) so the first paint is correct
  // before the first poll lands; the poll then keeps it live with agent counts.
  created.setTitle(renderTrayTitle({ active: 0, attention: 0 }));
  created.on('click', () => toggleTrayWindow(created.getBounds()));
  created.on('right-click', () => toggleTrayWindow(created.getBounds()));

  // Create the window up front (hidden) so the first open is instant.
  trayWindow = createTrayWindow();

  // Keep the menu-bar count live: poll the aggregate session status and reflect
  // working / needs-attention totals in the tray title.
  void pollAgentCounts().catch((err) => {
    throw err;
  });
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
