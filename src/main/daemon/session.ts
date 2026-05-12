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
  sessionId: string;
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

// Keyed by webContents.id → sessionId → ActiveSession.
// Supports multiple concurrent sessions per window (e.g. architect + workers).
const sessionsByWcId = new Map<number, Map<string, ActiveSession>>();

// Tracks the "active" session per webContents (send/resize target).
const activeByWcId = new Map<number, string>();

// In-flight connect promises, keyed by "wcId:sessionId".
// Reused when a duplicate connect arrives (e.g. React Strict Mode double-invoke)
// so the second caller awaits the same WebSocket open/error.
const pendingConnects = new Map<string, Promise<ConnectResult | ConnectError>>();

function connectKey(wcId: number, sessionId: string): string {
  return `${wcId}:${sessionId}`;
}

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
  const key = connectKey(wcId, sessionId);

  // If a WebSocket is already open for this session, return success immediately.
  const existing = sessionsByWcId.get(wcId)?.get(sessionId);
  if (existing?.ws.readyState === WebSocket.OPEN) {
    return Promise.resolve({ ok: true });
  }

  // If a connect is already in-flight for this session, reuse its promise.
  const pending = pendingConnects.get(key);
  if (pending) {
    console.log('[main:session] connect → reusing pending promise', { wcId, sessionId });
    return pending;
  }

  console.log('[main:session] connect', { wcId, sessionId, wsUrl });

  const sendToRenderer = (data: Uint8Array | string): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:data', { sessionId, data });
    }
  };

  const sendEventToRenderer = (event: SessionEvent): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:event', event);
    }
  };

  const promise = new Promise<ConnectResult | ConnectError>((resolve) => {
    let settled = false;
    const finish = (result: ConnectResult | ConnectError): void => {
      if (settled) return;
      settled = true;
      pendingConnects.delete(key);
      resolve(result);
    };

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    const session: ActiveSession = {
      finish,
      ws,
      sseAbort: new AbortController(),
      sendToRenderer,
      sendEventToRenderer,
      sessionId,
    };

    let wcSessions = sessionsByWcId.get(wcId);
    if (!wcSessions) {
      wcSessions = new Map();
      sessionsByWcId.set(wcId, wcSessions);
    }

    // Replace an existing session with the same sessionId (reconnect).
    const existing = wcSessions.get(sessionId);
    if (existing) {
      console.log('[main:session] connect → replacing existing session with same id', {
        wcId,
        sessionId,
      });
      existing.ws.close();
      existing.sseAbort.abort();
      existing.finish({ ok: false, message: 'WebSocket connection replaced' });
    }

    wcSessions.set(sessionId, session);
    // Auto-set as active if no active session yet for this wcId.
    if (!activeByWcId.has(wcId)) {
      activeByWcId.set(wcId, sessionId);
    }

    ws.addEventListener('open', () => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId) === session;
      if (!stillActive) {
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
      if (sessionsByWcId.get(wcId)?.get(sessionId) !== session) return;
      console.warn('[main:session] error', { wcId, sessionId, ev });
      session.sseAbort.abort();
      sessionsByWcId.get(wcId)?.delete(sessionId);
      if (activeByWcId.get(wcId) === sessionId) {
        activeByWcId.delete(wcId);
      }
      finish({ ok: false, message: 'WebSocket connection failed' });
    });

    ws.addEventListener('message', (ev) => {
      if (sessionsByWcId.get(wcId)?.get(sessionId) !== session) return;
      if (ev.data instanceof ArrayBuffer) {
        sendToRenderer(new Uint8Array(ev.data));
      } else {
        sendToRenderer(String(ev.data));
      }
    });

    ws.addEventListener('close', (ev) => {
      const wasActive = sessionsByWcId.get(wcId)?.get(sessionId) === session;
      console.log('[main:session] close', {
        wcId,
        sessionId,
        wasActive,
        code: ev.code,
        reason: ev.reason,
      });
      if (wasActive) {
        session.sseAbort.abort();
        const wcSessions = sessionsByWcId.get(wcId);
        if (wcSessions) {
          wcSessions.delete(sessionId);
          if (wcSessions.size === 0) sessionsByWcId.delete(wcId);
        }
        if (activeByWcId.get(wcId) === sessionId) {
          activeByWcId.delete(wcId);
        }
      }
      finish({ ok: false, message: 'WebSocket connection closed' });
    });
  });

  pendingConnects.set(key, promise);
  return promise;
}

export function disconnect(wcId: number, sessionId?: string): void {
  const wcSessions = sessionsByWcId.get(wcId);
  if (!wcSessions) {
    console.log('[main:session] disconnect → no active sessions', { wcId });
    return;
  }

  if (sessionId) {
    const session = wcSessions.get(sessionId);
    if (!session) {
      console.log('[main:session] disconnect → session not found', { wcId, sessionId });
      return;
    }
    console.log('[main:session] disconnect', { wcId, sessionId });
    session.ws.close();
    session.sseAbort.abort();
    wcSessions.delete(sessionId);
    if (wcSessions.size === 0) sessionsByWcId.delete(wcId);
    if (activeByWcId.get(wcId) === sessionId) {
      activeByWcId.delete(wcId);
    }
  } else {
    console.log('[main:session] disconnect → all sessions', { wcId, count: wcSessions.size });
    for (const [, s] of wcSessions) {
      s.ws.close();
      s.sseAbort.abort();
    }
    wcSessions.clear();
    sessionsByWcId.delete(wcId);
    activeByWcId.delete(wcId);
  }
}

export function setActive(wcId: number, sessionId: string): void {
  console.log('[main:session] setActive', { wcId, sessionId });
  activeByWcId.set(wcId, sessionId);
}

export function send(wcId: number, data: string): void {
  const activeSessionId = activeByWcId.get(wcId);
  if (!activeSessionId) {
    console.log('[main:session] send → no active session, dropping', { wcId });
    return;
  }
  const session = sessionsByWcId.get(wcId)?.get(activeSessionId);
  if (session && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(data);
  }
}

export function resize(wcId: number, cols: number, rows: number): void {
  const activeSessionId = activeByWcId.get(wcId);
  if (!activeSessionId) {
    console.log('[main:session] resize → no active session, dropping', { wcId, cols, rows });
    return;
  }
  const session = sessionsByWcId.get(wcId)?.get(activeSessionId);
  if (!session) {
    console.log('[main:session] resize → session not found, dropping', {
      wcId,
      activeSessionId,
      cols,
      rows,
    });
    return;
  }
  if (session.ws.readyState !== WebSocket.OPEN) {
    console.log('[main:session] resize → WS not open, dropping', {
      wcId,
      sessionId: activeSessionId,
      cols,
      rows,
      readyState: session.ws.readyState,
    });
    return;
  }
  console.log('[main:session] resize → sending', { wcId, sessionId: activeSessionId, cols, rows });
  session.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}
