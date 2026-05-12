import type { WebContents } from 'electron';
import type { SessionEvent } from '../../shared/types';
import { DAEMON_URL } from './client';
import { consumeSseBuffer, dispatchSseBlock } from './sse';

interface ActiveSession {
  finish: (result: ConnectResult | ConnectError) => void;
  ws: WebSocket;
  sseAbort: AbortController;
  sendToRenderer: (data: Uint8Array | string) => void;
  sendEventToRenderer: (event: SessionEvent) => void;
}

function parseSessionEvent(data: string, sendEventToRenderer: (event: SessionEvent) => void): void {
  try {
    sendEventToRenderer(JSON.parse(data) as SessionEvent);
  } catch {
    // Ignore malformed event payloads and keep consuming the stream.
  }
}

async function consumeSse(
  sessionId: string,
  signal: AbortSignal,
  sendEventToRenderer: (event: SessionEvent) => void,
): Promise<void> {
  const onData = (data: string): void => parseSessionEvent(data, sendEventToRenderer);

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
      buffer = consumeSseBuffer(buffer + decoder.decode(value, { stream: true }), onData);
    }

    buffer = consumeSseBuffer(buffer + decoder.decode(), onData);
    if (buffer.trim()) {
      dispatchSseBlock(buffer, onData);
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
  console.log('[main:session] connect', { wcId, sessionId, wsUrl });

  const sendToRenderer = (data: Uint8Array | string): void => {
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
    let settled = false;
    const finish = (result: ConnectResult | ConnectError): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const ws = new WebSocket(wsUrl);
    // PTY output comes as BinaryMessage. Tell the WebSocket to surface binary
    // frames as ArrayBuffer (the default in Electron's main-process WebSocket
    // is Blob, which we'd have to async-read).
    ws.binaryType = 'arraybuffer';
    const session: ActiveSession = {
      finish,
      ws,
      sseAbort: new AbortController(),
      sendToRenderer,
      sendEventToRenderer,
    };

    // Replace any existing session on this window, including one that is still
    // connecting and has not fired `open` yet.
    const existing = sessions.get(wcId);
    if (existing) {
      console.log('[main:session] connect → replacing existing session', { wcId });
      existing.ws.close();
      existing.sseAbort.abort();
      existing.finish({ ok: false, message: 'WebSocket connection replaced' });
    }

    sessions.set(wcId, session);

    ws.addEventListener('open', () => {
      if (sessions.get(wcId) !== session) {
        console.log('[main:session] open fired but session was replaced — ignoring', {
          wcId,
          sessionId,
        });
        return;
      }
      console.log('[main:session] open ✓', { wcId, sessionId });
      void consumeSse(sessionId, session.sseAbort.signal, sendEventToRenderer);
      finish({ ok: true });
    });

    ws.addEventListener('error', (ev) => {
      if (sessions.get(wcId) !== session) return;
      console.warn('[main:session] error', { wcId, sessionId, ev });
      session.sseAbort.abort();
      sessions.delete(wcId);
      finish({ ok: false, message: 'WebSocket connection failed' });
    });

    ws.addEventListener('message', (ev) => {
      if (sessions.get(wcId) !== session) return;
      // PTY output arrives as ArrayBuffer (binary frame). Convert to Uint8Array
      // and forward to the renderer; xterm.write() accepts Uint8Array directly
      // and handles split UTF-8 codepoints correctly across chunks.
      if (ev.data instanceof ArrayBuffer) {
        sendToRenderer(new Uint8Array(ev.data));
      } else {
        // Fallback for any text frame (shouldn't happen with current daemon).
        sendToRenderer(String(ev.data));
      }
    });

    ws.addEventListener('close', (ev) => {
      const wasActive = sessions.get(wcId) === session;
      console.log('[main:session] close', {
        wcId,
        sessionId,
        wasActive,
        code: ev.code,
        reason: ev.reason,
      });
      if (wasActive) {
        session.sseAbort.abort();
        sessions.delete(wcId);
      }
      finish({ ok: false, message: 'WebSocket connection closed' });
    });
  });
}

export function disconnect(wcId: number): void {
  const session = sessions.get(wcId);
  if (!session) {
    console.log('[main:session] disconnect → no active session', { wcId });
    return;
  }
  console.log('[main:session] disconnect', { wcId });
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
  if (!session) {
    console.log('[main:session] resize → no active session, dropping', { wcId, cols, rows });
    return;
  }
  if (session.ws.readyState !== WebSocket.OPEN) {
    console.log('[main:session] resize → WS not open, dropping', {
      wcId,
      cols,
      rows,
      readyState: session.ws.readyState,
    });
    return;
  }
  console.log('[main:session] resize → sending', { wcId, cols, rows });
  session.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}
