import type { ArchitectEvent } from '@hiveryn/shared/domain';
import type { WebContents } from 'electron';
import {
  type ArchitectStreamEvent,
  type InfraErrorEvent,
  STREAM_CONNECTED_EVENT_TYPE,
} from '../../shared/types';
import { DAEMON_URL } from './client';
import { consumeSseBuffer, dispatchSseBlock } from './sse';

function sendInfraError(
  sender: WebContents,
  message: string,
  details?: Record<string, unknown>,
): void {
  if (sender.isDestroyed()) return;
  sender.send('errors:infra-event', {
    source: 'architect-events',
    message,
    details,
    timestamp: Date.now(),
  } satisfies InfraErrorEvent);
}

interface Subscription {
  wcId: number;
  architectKey: string;
  sender: WebContents;
  abort: AbortController;
}

const subscriptions = new Map<string, Subscription>();

function subKey(wcId: number, architectKey: string): string {
  return `${wcId}:${architectKey}`;
}

export function subscribe(sender: WebContents, architectKey: string): void {
  const wcId = sender.id;
  const key = subKey(wcId, architectKey);

  const existing = subscriptions.get(key);
  existing?.abort.abort();

  subscriptions.set(key, {
    wcId,
    architectKey,
    sender,
    abort: new AbortController(),
  });

  sender.once('destroyed', () => {
    const subscription = subscriptions.get(key);
    subscription?.abort.abort();
    subscriptions.delete(key);
  });

  startSubscription(key);
}

export function unsubscribe(wcId: number, architectKey: string): void {
  const key = subKey(wcId, architectKey);
  const sub = subscriptions.get(key);
  if (sub) {
    sub.abort.abort();
    subscriptions.delete(key);
  }
}

export function handleDaemonUnavailable(): void {
  for (const subscription of subscriptions.values()) {
    subscription.abort.abort();
  }
}

export function handleDaemonAvailable(): void {
  for (const key of subscriptions.keys()) {
    startSubscription(key);
  }
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

function startSubscription(key: string): void {
  const subscription = subscriptions.get(key);
  if (!subscription) {
    return;
  }
  if (subscription.sender.isDestroyed()) {
    subscriptions.delete(key);
    return;
  }

  subscription.abort.abort();
  subscription.abort = new AbortController();
  void runSubscriptionLoop(
    subscription.architectKey,
    subscription.abort.signal,
    subscription.sender,
  );
}

// Keeps the SSE stream alive across transient drops. Each (re)connect reconciles
// board state in the renderer, so any event missed while disconnected is
// recovered. Exits as soon as the signal is aborted (unsubscribe / window gone /
// daemon-unavailable), which is the only thing that must NOT trigger a reconnect.
async function runSubscriptionLoop(
  architectKey: string,
  signal: AbortSignal,
  sender: WebContents,
): Promise<void> {
  let backoff = RECONNECT_BASE_MS;
  while (!signal.aborted && !sender.isDestroyed()) {
    const connected = await consumeArchitectEventStream(architectKey, signal, sender);
    if (signal.aborted || sender.isDestroyed()) {
      return;
    }
    // Reset backoff after a connection that actually opened, so a healthy stream
    // that briefly drops reconnects quickly; a connection that never opens backs
    // off up to the cap.
    backoff = connected ? RECONNECT_BASE_MS : Math.min(backoff * 2, RECONNECT_MAX_MS);
    console.log('[main:architect-events] reconnecting', { architectKey, delayMs: backoff });
    await delay(backoff, signal);
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// Returns true if the stream opened (so the loop can reset its backoff).
async function consumeArchitectEventStream(
  architectKey: string,
  signal: AbortSignal,
  sender: WebContents,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${DAEMON_URL}/api/architects/${encodeURIComponent(architectKey)}/events`,
      { signal, headers: { Accept: 'text/event-stream' } },
    );

    if (!response.ok) {
      console.warn('[main:architect-events] fetch returned', response.status, architectKey);
      sendInfraError(sender, `stream fetch failed (HTTP ${response.status})`, { architectKey });
      return false;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.warn('[main:architect-events] response.body is null', architectKey);
      sendInfraError(sender, 'stream response had no body', { architectKey });
      return false;
    }

    console.log('[main:architect-events] stream connected', {
      wcId: sender.id,
      architectKey,
    });

    // Reconcile on every (re)connect: tell the renderer to refetch the board so
    // any event published while we were disconnected is recovered.
    if (!sender.isDestroyed()) {
      sender.send('architect:workspace-event', {
        type: STREAM_CONNECTED_EVENT_TYPE,
        architect_key: architectKey,
        at: new Date().toISOString(),
      } satisfies ArchitectStreamEvent);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const onData = (data: string): void => {
      let event: ArchitectEvent;
      try {
        event = JSON.parse(data) as ArchitectEvent;
      } catch (error) {
        console.warn('[main:architect-events] failed to parse event', {
          architectKey,
          data,
          error: (error as Error).message,
        });
        return;
      }
      if (!sender.isDestroyed()) {
        sender.send('architect:workspace-event', event);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = consumeSseBuffer(buffer + decoder.decode(value, { stream: true }), onData);
    }

    buffer = consumeSseBuffer(buffer + decoder.decode(), onData);
    if (buffer.trim()) {
      dispatchSseBlock(buffer, onData);
    }
    console.log('[main:architect-events] stream ended', { architectKey });
    return true;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('[main:architect-events] stream error', (err as Error).message);
      sendInfraError(sender, (err as Error).message, { architectKey });
    }
    return false;
  }
}
