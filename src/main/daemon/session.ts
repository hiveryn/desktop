import type { WebContents } from 'electron';
import type { SessionEvent } from '../../shared/types';
import { DAEMON_URL } from './client';
import { consumeSseBuffer, dispatchSseBlock } from './sse';

interface TerminalConnection {
  ws: WebSocket;
  terminalId: string;
}

interface ActiveSession {
  terminals: Map<string, TerminalConnection>;
  sseAbort: AbortController;
  sseRunning: boolean;
  sendToRenderer: (sessionId: string, terminalId: string, data: Uint8Array | string) => void;
  sendEventToRenderer: (event: SessionEvent) => void;
  sendTerminalClosedToRenderer: (sessionId: string, terminalId: string) => void;
  sessionId: string;
}

function parseSessionEvent(data: string, sendEventToRenderer: (event: SessionEvent) => void): void {
  sendEventToRenderer(JSON.parse(data) as SessionEvent);
}

async function consumeSse(
  sessionId: string,
  signal: AbortSignal,
  sendEventToRenderer: (event: SessionEvent) => void,
): Promise<void> {
  const onData = (data: string): void => parseSessionEvent(data, sendEventToRenderer);

  const response = await fetch(
    `${DAEMON_URL}/api/sessions/${encodeURIComponent(sessionId)}/events`,
    {
      signal,
      headers: { Accept: 'text/event-stream' },
    },
  );
  if (!response.ok) {
    throw new Error(`session event stream failed: ${response.status} ${response.statusText}`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`session event stream missing body for ${sessionId}`);
  }
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
}

// Keyed by webContents.id → sessionId → ActiveSession.
// Supports multiple concurrent sessions per window (e.g. architect + workers).
const sessionsByWcId = new Map<number, Map<string, ActiveSession>>();

// In-flight connect promises, keyed by "wcId:sessionId:terminalId".
const pendingConnects = new Map<string, Promise<ConnectResult | ConnectError>>();

function connectKey(wcId: number, sessionId: string, terminalId: string): string {
  return `${wcId}:${sessionId}:${terminalId}`;
}

function terminalWsUrl(sessionId: string, terminalId: string): string {
  const wsBase = DAEMON_URL.replace(/^http/, 'ws');
  return `${wsBase}/ws/session/${encodeURIComponent(sessionId)}/terminal/${encodeURIComponent(terminalId)}`;
}

export interface ConnectResult {
  ok: true;
}

export interface ConnectError {
  ok: false;
  message: string;
}

function startSse(session: ActiveSession, sessionId: string): void {
  if (session.sseRunning) return;
  session.sseRunning = true;
  void consumeSse(sessionId, session.sseAbort.signal, session.sendEventToRenderer)
    .catch((err) => {
      if (session.sseAbort.signal.aborted) {
        return;
      }
      console.warn('[main:session] SSE stream failed', {
        sessionId,
        message: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      session.sseRunning = false;
    });
}

function detachTerminal(session: ActiveSession, terminalId: string, closeSocket: boolean): void {
  const conn = session.terminals.get(terminalId);
  if (!conn) {
    return;
  }

  session.terminals.delete(terminalId);
  if (closeSocket) {
    conn.ws.close();
  }
}

function teardownSession(wcId: number, sessionId: string, session: ActiveSession): void {
  session.sseAbort.abort();
  session.sseRunning = false;
  const wcSessions = sessionsByWcId.get(wcId);
  if (wcSessions) {
    wcSessions.delete(sessionId);
    if (wcSessions.size === 0) sessionsByWcId.delete(wcId);
  }
}

export function connect(
  sender: WebContents,
  sessionId: string,
  terminalId: string,
): Promise<ConnectResult | ConnectError> {
  const wcId = sender.id;
  const wsUrl = terminalWsUrl(sessionId, terminalId);
  const key = connectKey(wcId, sessionId, terminalId);

  // If this terminal's WS is already open, return success immediately.
  const existing = sessionsByWcId.get(wcId)?.get(sessionId);
  const existingTerminal = existing?.terminals.get(terminalId);
  if (existingTerminal?.ws.readyState === WebSocket.OPEN) {
    return Promise.resolve({ ok: true });
  }

  // If a connect is already in-flight for this terminal, reuse its promise.
  const pending = pendingConnects.get(key);
  if (pending) {
    console.log('[main:session] connect → reusing pending promise', {
      wcId,
      sessionId,
      terminalId,
    });
    return pending;
  }

  console.log('[main:session] connect', { wcId, sessionId, terminalId, wsUrl });

  const sendToRenderer = (sid: string, tid: string, data: Uint8Array | string): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:data', { sessionId: sid, terminalId: tid, data });
    }
  };

  const sendEventToRenderer = (event: SessionEvent): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:event', event);
    }
  };

  const sendTerminalClosedToRenderer = (sid: string, tid: string): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:terminal-closed', { sessionId: sid, terminalId: tid });
    }
  };

  const promise = new Promise<ConnectResult | ConnectError>((resolve) => {
    let settled = false;
    const settle = (result: ConnectResult | ConnectError): void => {
      if (settled) return;
      settled = true;
      pendingConnects.delete(key);
      resolve(result);
    };

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    let wcSessions = sessionsByWcId.get(wcId);
    if (!wcSessions) {
      wcSessions = new Map();
      sessionsByWcId.set(wcId, wcSessions);
    }

    let session = wcSessions.get(sessionId);
    if (!session) {
      session = {
        terminals: new Map(),
        sseAbort: new AbortController(),
        sseRunning: false,
        sendToRenderer,
        sendEventToRenderer,
        sendTerminalClosedToRenderer,
        sessionId,
      };
      wcSessions.set(sessionId, session);
    }
    startSse(session, sessionId);

    // Replace any existing terminal connection with the same UUID.
    const oldConn = session.terminals.get(terminalId);
    if (oldConn) {
      console.log('[main:session] connect → replacing existing terminal WS', {
        wcId,
        sessionId,
        terminalId,
      });
      oldConn.ws.close();
    }

    const conn: TerminalConnection = { ws, terminalId };
    session.terminals.set(terminalId, conn);

    ws.addEventListener('open', () => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      if (!stillActive || stillActive.terminals.get(terminalId) !== conn) {
        console.log('[main:session] open fired but session/terminal was replaced — ignoring', {
          wcId,
          sessionId,
          terminalId,
        });
        return;
      }
      console.log('[main:session] open ✓', { wcId, sessionId, terminalId });
      settle({ ok: true });
    });

    ws.addEventListener('error', (ev) => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      if (!stillActive || stillActive.terminals.get(terminalId) !== conn) return;
      console.warn('[main:session] error', { wcId, sessionId, terminalId, ev });
      settle({ ok: false, message: 'WebSocket connection failed' });
    });

    ws.addEventListener('message', (ev) => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      if (!stillActive || stillActive.terminals.get(terminalId) !== conn) return;
      if (ev.data instanceof ArrayBuffer) {
        sendToRenderer(sessionId, terminalId, new Uint8Array(ev.data));
      } else {
        sendToRenderer(sessionId, terminalId, String(ev.data));
      }
    });

    ws.addEventListener('close', (ev) => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      const wasActive = stillActive && stillActive.terminals.get(terminalId) === conn;
      console.log('[main:session] close', {
        wcId,
        sessionId,
        terminalId,
        wasActive,
        code: ev.code,
        reason: ev.reason,
      });
      if (stillActive && wasActive) {
        stillActive.sendTerminalClosedToRenderer(sessionId, terminalId);
        detachTerminal(stillActive, terminalId, false);
      }
      settle({ ok: false, message: 'WebSocket connection closed' });
    });
  });

  pendingConnects.set(key, promise);
  return promise;
}

export function disconnect(wcId: number, sessionId?: string, terminalId?: string): void {
  const wcSessions = sessionsByWcId.get(wcId);
  if (!wcSessions) {
    console.log('[main:session] disconnect → no active sessions', { wcId });
    return;
  }

  if (sessionId && terminalId) {
    const session = wcSessions.get(sessionId);
    if (!session) return;
    console.log('[main:session] disconnect terminal', { wcId, sessionId, terminalId });
    detachTerminal(session, terminalId, true);
  } else if (sessionId) {
    const session = wcSessions.get(sessionId);
    if (!session) {
      console.log('[main:session] disconnect → session not found', { wcId, sessionId });
      return;
    }
    console.log('[main:session] disconnect session', { wcId, sessionId });
    for (const [name] of session.terminals) {
      const conn = session.terminals.get(name);
      if (conn) conn.ws.close();
    }
    session.terminals.clear();
    teardownSession(wcId, sessionId, session);
  } else {
    console.log('[main:session] disconnect → all sessions', { wcId, count: wcSessions.size });
    for (const [activeSessionId, session] of wcSessions) {
      for (const [, conn] of session.terminals) {
        conn.ws.close();
      }
      session.terminals.clear();
      teardownSession(wcId, activeSessionId, session);
    }
  }
}

export function handleDaemonUnavailable(): void {
  const sockets: WebSocket[] = [];

  for (const [, wcSessions] of sessionsByWcId) {
    for (const [, session] of wcSessions) {
      session.sseAbort.abort();
      session.sseRunning = false;
      for (const [, conn] of session.terminals) {
        sockets.push(conn.ws);
      }
      session.terminals.clear();
    }
  }

  sessionsByWcId.clear();

  for (const socket of sockets) {
    socket.close();
  }
}

export function send(wcId: number, sessionId: string, terminalId: string, data: string): void {
  const session = sessionsByWcId.get(wcId)?.get(sessionId);
  const conn = session?.terminals.get(terminalId);
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(data);
  }
}

export function resize(
  wcId: number,
  sessionId: string,
  terminalId: string,
  cols: number,
  rows: number,
): void {
  if (cols <= 0 || rows <= 0) return;
  const session = sessionsByWcId.get(wcId)?.get(sessionId);
  const conn = session?.terminals.get(terminalId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;
  conn.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}
