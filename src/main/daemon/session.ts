import type { WebContents } from 'electron';
import type { SessionEvent } from '../../shared/types';
import { DAEMON_URL } from './client';
import { consumeSseBuffer, dispatchSseBlock } from './sse';

interface TerminalConnection {
  ws: WebSocket;
  terminalId: string;
}

interface ActiveSession {
  finish: (result: ConnectResult | ConnectError) => void;
  terminals: Map<string, TerminalConnection>;
  sseAbort: AbortController;
  sseRunning: boolean;
  sendToRenderer: (sessionId: string, terminalId: string, data: Uint8Array | string) => void;
  sendEventToRenderer: (event: SessionEvent) => void;
  sendTerminalClosedToRenderer: (sessionId: string, terminalId: string) => void;
  sessionId: string;
}

function parseSessionEvent(data: string, sendEventToRenderer: (event: SessionEvent) => void): void {
  try {
    sendEventToRenderer(JSON.parse(data) as SessionEvent);
  } catch {}
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
  } catch {}
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
  void consumeSse(sessionId, session.sseAbort.signal, session.sendEventToRenderer);
}

function cleanupTerminal(
  wcId: number,
  sessionId: string,
  session: ActiveSession,
  terminalId: string,
): void {
  const conn = session.terminals.get(terminalId);
  if (conn) {
    conn.ws.close();
    session.terminals.delete(terminalId);
  }

  if (session.terminals.size === 0) {
    session.sseAbort.abort();
    session.finish({ ok: false, message: 'All terminals disconnected' });
    const wcSessions = sessionsByWcId.get(wcId);
    if (wcSessions) {
      wcSessions.delete(sessionId);
      if (wcSessions.size === 0) sessionsByWcId.delete(wcId);
    }
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
    const finish = (_result: ConnectResult | ConnectError): void => {
      if (settled) return;
      settled = true;
      pendingConnects.delete(key);
      // Resolve the outer promise only for the initial connect call.
      // finish may be called again during cleanup — ignore duplicate resolves.
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
        finish,
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
      startSse(session, sessionId);
      finish({ ok: true });
      resolve({ ok: true });
    });

    ws.addEventListener('error', (ev) => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      if (!stillActive || stillActive.terminals.get(terminalId) !== conn) return;
      console.warn('[main:session] error', { wcId, sessionId, terminalId, ev });
      cleanupTerminal(wcId, sessionId, stillActive, terminalId);
      finish({ ok: false, message: 'WebSocket connection failed' });
      resolve({ ok: false, message: 'WebSocket connection failed' });
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
        cleanupTerminal(wcId, sessionId, stillActive, terminalId);
      }
      finish({ ok: false, message: 'WebSocket connection closed' });
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
    cleanupTerminal(wcId, sessionId, session, terminalId);
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
    session.sseAbort.abort();
    session.finish({ ok: false, message: 'Session disconnected' });
    wcSessions.delete(sessionId);
    if (wcSessions.size === 0) sessionsByWcId.delete(wcId);
  } else {
    console.log('[main:session] disconnect → all sessions', { wcId, count: wcSessions.size });
    for (const [, session] of wcSessions) {
      for (const [, conn] of session.terminals) {
        conn.ws.close();
      }
      session.terminals.clear();
      session.sseAbort.abort();
      session.finish({ ok: false, message: 'All sessions disconnected' });
    }
    wcSessions.clear();
    sessionsByWcId.delete(wcId);
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
