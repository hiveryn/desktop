import type { WebContents } from 'electron';
import type { SessionEvent } from '../../shared/types';
import { DAEMON_URL } from './client';

interface ActiveSession {
  ws: WebSocket;
  sseAbort: AbortController;
  sendToRenderer: (data: string) => void;
  sendEventToRenderer: (event: SessionEvent) => void;
}

function dispatchSseBlock(block: string, sendEventToRenderer: (event: SessionEvent) => void): void {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');

  if (!data) return;

  try {
    sendEventToRenderer(JSON.parse(data) as SessionEvent);
  } catch {
    // Ignore malformed event payloads and keep consuming the stream.
  }
}

function consumeSseBuffer(
  buffer: string,
  sendEventToRenderer: (event: SessionEvent) => void,
): string {
  let remaining = buffer.replace(/\r\n/g, '\n');
  let boundaryIndex = remaining.indexOf('\n\n');

  while (boundaryIndex !== -1) {
    const block = remaining.slice(0, boundaryIndex);
    dispatchSseBlock(block, sendEventToRenderer);
    remaining = remaining.slice(boundaryIndex + 2);
    boundaryIndex = remaining.indexOf('\n\n');
  }

  return remaining;
}

async function consumeSse(
  sessionId: string,
  signal: AbortSignal,
  sendEventToRenderer: (event: SessionEvent) => void,
): Promise<void> {
  try {
    const response = await fetch(
      `${DAEMON_URL}/api/sessions/${encodeURIComponent(sessionId)}/events`,
      { signal, headers: { Accept: 'text/event-stream' } },
    );
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = consumeSseBuffer(
        buffer + decoder.decode(value, { stream: true }),
        sendEventToRenderer,
      );
    }

    buffer = consumeSseBuffer(buffer + decoder.decode(), sendEventToRenderer);
    if (buffer.trim()) {
      dispatchSseBlock(buffer, sendEventToRenderer);
    }
  } catch {
    // Aborted or stream ended — expected on disconnect
  }
}

// Keyed by webContents.id — one active session per window.
const sessions = new Map<number, ActiveSession>();

export interface ConnectResult {
  ok: true;
}

export interface ConnectError {
  ok: false;
  message: string;
}

export function connect(
  sender: WebContents,
  sessionId: string,
  wsUrl: string,
): Promise<ConnectResult | ConnectError> {
  const wcId = sender.id;

  // Replace any existing session on this window
  const existing = sessions.get(wcId);
  if (existing) {
    existing.ws.close();
    existing.sseAbort.abort();
    sessions.delete(wcId);
  }

  const sendToRenderer = (data: string): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:data', data);
    }
  };

  const sendEventToRenderer = (event: SessionEvent): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:event', event);
    }
  };

  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
      const sseAbort = new AbortController();
      sessions.set(wcId, { ws, sseAbort, sendToRenderer, sendEventToRenderer });
      void consumeSse(sessionId, sseAbort.signal, sendEventToRenderer);
      resolve({ ok: true });
    });

    ws.addEventListener('error', () => {
      resolve({ ok: false, message: 'WebSocket connection failed' });
    });

    ws.addEventListener('message', (ev) => {
      sendToRenderer(String(ev.data));
    });

    ws.addEventListener('close', () => {
      sessions.delete(wcId);
    });
  });
}

export function disconnect(wcId: number): void {
  const session = sessions.get(wcId);
  if (!session) return;
  session.ws.close();
  session.sseAbort.abort();
  sessions.delete(wcId);
}

export function send(wcId: number, data: string): void {
  const session = sessions.get(wcId);
  if (session && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(data);
  }
}

export function resize(wcId: number, cols: number, rows: number): void {
  const session = sessions.get(wcId);
  if (session && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  }
}
