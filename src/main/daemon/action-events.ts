import type { ActionEvent } from '@hiveryn/shared/domain';
import type { WebContents } from 'electron';
import {
  type ActionStreamEvent,
  type InfraErrorEvent,
  STREAM_CONNECTED_EVENT_TYPE,
} from '../../shared/types';
import { DAEMON_URL } from './client';
import { consumeSseBuffer, dispatchSseBlock } from './sse';

// The global actions stream (GET /api/actions/events), one subscription per
// webContents. Like the architect stream it has no backlog: every (re)connect
// sends a local stream_connected so the renderer refetches executions.

function sendInfraError(sender: WebContents, message: string): void {
  if (sender.isDestroyed()) return;
  sender.send('errors:infra-event', {
    source: 'action-events',
    message,
    timestamp: Date.now(),
  } satisfies InfraErrorEvent);
}

interface Subscription {
  sender: WebContents;
  abort: AbortController;
}

const subscriptions = new Map<number, Subscription>();

export function subscribe(sender: WebContents): void {
  const existing = subscriptions.get(sender.id);
  existing?.abort.abort();
  subscriptions.set(sender.id, { sender, abort: new AbortController() });
  const wcId = sender.id;
  sender.once('destroyed', () => unsubscribe(wcId));
  start(wcId);
}

export function unsubscribe(wcId: number): void {
  subscriptions.get(wcId)?.abort.abort();
  subscriptions.delete(wcId);
}

export function handleDaemonUnavailable(): void {
  for (const subscription of subscriptions.values()) subscription.abort.abort();
}

export function handleDaemonAvailable(): void {
  for (const wcId of subscriptions.keys()) start(wcId);
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

function start(wcId: number): void {
  const subscription = subscriptions.get(wcId);
  if (!subscription) return;
  if (subscription.sender.isDestroyed()) {
    subscriptions.delete(wcId);
    return;
  }
  subscription.abort.abort();
  subscription.abort = new AbortController();
  void runLoop(subscription.abort.signal, subscription.sender);
}

async function runLoop(signal: AbortSignal, sender: WebContents): Promise<void> {
  let backoff = RECONNECT_BASE_MS;
  while (!signal.aborted && !sender.isDestroyed()) {
    const connected = await consume(signal, sender);
    if (signal.aborted || sender.isDestroyed()) return;
    backoff = connected ? RECONNECT_BASE_MS : Math.min(backoff * 2, RECONNECT_MAX_MS);
    console.log('[main:action-events] reconnecting', { delayMs: backoff });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, backoff);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}

async function consume(signal: AbortSignal, sender: WebContents): Promise<boolean> {
  try {
    const response = await fetch(`${DAEMON_URL}/api/actions/events`, {
      signal,
      headers: { Accept: 'text/event-stream' },
    });
    if (!response.ok) {
      sendInfraError(sender, `actions stream fetch failed (HTTP ${response.status})`);
      return false;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      sendInfraError(sender, 'actions stream response had no body');
      return false;
    }
    if (!sender.isDestroyed()) {
      sender.send('actions:event', {
        type: STREAM_CONNECTED_EVENT_TYPE,
        at: new Date().toISOString(),
      } satisfies ActionStreamEvent);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const onData = (data: string): void => {
      let event: ActionEvent;
      try {
        event = JSON.parse(data) as ActionEvent;
      } catch (error) {
        console.warn('[main:action-events] failed to parse event', {
          data,
          error: (error as Error).message,
        });
        return;
      }
      if (!sender.isDestroyed()) sender.send('actions:event', event);
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = consumeSseBuffer(buffer + decoder.decode(value, { stream: true }), onData);
    }
    buffer = consumeSseBuffer(buffer + decoder.decode(), onData);
    if (buffer.trim()) dispatchSseBlock(buffer, onData);
    return true;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('[main:action-events] stream error', (err as Error).message);
      sendInfraError(sender, (err as Error).message);
    }
    return false;
  }
}
