import { join } from 'node:path';
import { app, nativeImage, Tray } from 'electron';
import type { ArchitectStatus } from '../shared/types';
import { daemonFetch } from './daemon/client';
import { IS_DESKTOP_DEVELOPMENT } from './runtime';
import { revealSidebarSearch } from './workbench';

// Daemon `SessionRun.AgentStatus` values (internal/domain/session.go). `active`
// = the agent is working; `idle`/`waiting` = it needs the user's attention;
// `stopped` runs never appear in /api/architects/status (it lists only running
// sessions) but are excluded regardless.
const AGENT_STATUS_ACTIVE = 'active';
const AGENT_STATUS_IDLE = 'idle';
const AGENT_STATUS_WAITING = 'waiting';

// How often the main process polls the aggregate status for the tray title. The
// menu-bar count is ambient info, so a relaxed cadence is fine.
const STATUS_POLL_INTERVAL_MS = 3000;

interface ArchitectStatusPayload {
  architects: ArchitectStatus[];
}

interface AgentCounts {
  active: number;
  attention: number;
}

let tray: Tray | null = null;
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
  // The icon is a way back to the workbench: forward, sidebar expanded,
  // search focused — the same as the global shortcut.
  created.on('click', () => revealSidebarSearch());
  created.on('right-click', () => revealSidebarSearch());

  // Keep the menu-bar count live: poll the aggregate session status and reflect
  // working / needs-attention totals in the tray title.
  void pollAgentCounts().catch((err) => {
    throw err;
  });
}
