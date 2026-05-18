import { BrowserWindow } from 'electron';
import type { DaemonHealthState, DaemonHealthStatus, DesktopConfig } from '../../shared/types';
import * as architectEvents from './architect-events';
import { DAEMON_URL, daemonFetch } from './client';
import * as sessionManager from './session';

const DEFAULT_POLL_INTERVAL_MS = 1000;
const HEALTH_REQUEST_TIMEOUT_MS = 1000;

let currentStatus: DaemonHealthStatus = 'unknown';
let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export function start(): void {
  if (running) {
    return;
  }
  running = true;
  void poll().catch((err) => {
    throw err;
  });
}

export function stop(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function getState(): DaemonHealthState {
  return { status: currentStatus };
}

async function poll(): Promise<void> {
  if (!running) {
    return;
  }

  const nextStatus = await probeHealth();
  const previousStatus = currentStatus;

  if (nextStatus === 'healthy' && previousStatus !== 'healthy') {
    pollIntervalMs = await loadPollIntervalMs();
  }

  if (nextStatus !== previousStatus) {
    currentStatus = nextStatus;
    if (nextStatus === 'unreachable') {
      sessionManager.handleDaemonUnavailable();
      architectEvents.handleDaemonUnavailable();
    } else if (previousStatus === 'unreachable') {
      architectEvents.handleDaemonAvailable();
    }
    broadcastState();
  }

  scheduleNextPoll();
}

function scheduleNextPoll(): void {
  if (!running) {
    return;
  }
  timer = setTimeout(() => {
    void poll().catch((err) => {
      throw err;
    });
  }, pollIntervalMs);
}

async function probeHealth(): Promise<DaemonHealthStatus> {
  let response: Response;
  try {
    response = await fetch(`${DAEMON_URL}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
  } catch {
    return 'unreachable';
  }

  if (!response.ok) {
    return 'unreachable';
  }

  const body = (await response.json()) as {
    data?: { status?: string } | null;
  };
  if (body.data?.status !== 'ok') {
    throw new Error(`Unexpected /api/health payload: ${JSON.stringify(body)}`);
  }

  return 'healthy';
}

async function loadPollIntervalMs(): Promise<number> {
  const result = await daemonFetch<DesktopConfig>('/api/config/desktop');
  if (result.httpStatus !== 200 || result.envelope.error) {
    throw new Error(
      `Failed to load desktop config: ${result.httpStatus} ${result.envelope.error?.message ?? 'missing config payload'}`,
    );
  }

  const intervalMs = result.envelope.data?.health_poll_interval_ms;
  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(`Invalid health_poll_interval_ms: ${JSON.stringify(result.envelope.data)}`);
  }

  return intervalMs;
}

function broadcastState(): void {
  const state = getState();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('daemon:health-status', state);
    }
  }
}
