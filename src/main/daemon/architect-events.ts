import type { WebContents } from 'electron';
import type { WorkspaceChangedEvent } from '../../shared/types';
import { DAEMON_URL } from './client';
import { consumeSseBuffer, dispatchSseBlock } from './sse';

interface Subscription {
  wcId: number;
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
  if (existing) {
    existing.abort.abort();
  }

  const abort = new AbortController();
  subscriptions.set(key, { wcId, abort });

  sender.once('destroyed', () => {
    abort.abort();
    subscriptions.delete(key);
  });

  void consumeArchitectEventStream(architectKey, abort.signal, sender);
}

export function unsubscribe(wcId: number, architectKey: string): void {
  const key = subKey(wcId, architectKey);
  const sub = subscriptions.get(key);
  if (sub) {
    sub.abort.abort();
    subscriptions.delete(key);
  }
}

async function consumeArchitectEventStream(
  architectKey: string,
  signal: AbortSignal,
  sender: WebContents,
): Promise<void> {
  try {
    const response = await fetch(
      `${DAEMON_URL}/api/architects/${encodeURIComponent(architectKey)}/events`,
      { signal, headers: { Accept: 'text/event-stream' } },
    );

    if (!response.ok) {
      console.warn('[main:architect-events] fetch returned', response.status, architectKey);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.warn('[main:architect-events] response.body is null', architectKey);
      return;
    }

    console.log('[main:architect-events] stream connected', {
      wcId: sender.id,
      architectKey,
    });

    const decoder = new TextDecoder();
    let buffer = '';

    const onData = (data: string): void => {
      try {
        const event = JSON.parse(data) as WorkspaceChangedEvent;
        if (!sender.isDestroyed()) {
          sender.send('architect:workspace-event', event);
        }
      } catch {
        // Ignore malformed event payloads
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
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('[main:architect-events] stream error', (err as Error).message);
    }
  }
}
