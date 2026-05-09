import type { WebContents } from 'electron';
import { DAEMON_URL } from './client';

interface ActiveSession {
  ws: WebSocket;
  sseAbort: AbortController;
  sendToRenderer: (data: string) => void;
}

async function consumeSse(sessionId: string, signal: AbortSignal): Promise<void> {
  try {
    const response = await fetch(
      `${DAEMON_URL}/api/sessions/${encodeURIComponent(sessionId)}/events`,
      { signal, headers: { Accept: 'text/event-stream' } },
    );
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      console.log('[session SSE]', decoder.decode(value, { stream: true }));
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

  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
      const sseAbort = new AbortController();
      sessions.set(wcId, { ws, sseAbort, sendToRenderer });
      void consumeSse(sessionId, sseAbort.signal);
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
