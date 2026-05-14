import type { WebContents } from 'electron';
import type { SessionEvent } from '../../shared/types';
import { DAEMON_URL } from './client';
import { consumeSseBuffer, dispatchSseBlock } from './sse';

interface TerminalConnection {
  ws: WebSocket;
  terminalName: string;
}

interface ActiveSession {
  finish: (result: ConnectResult | ConnectError) => void;
  terminals: Map<string, TerminalConnection>;
  sseAbort: AbortController;
  sseRunning: boolean;
  sendToRenderer: (sessionId: string, terminalName: string, data: Uint8Array | string) => void;
  sendEventToRenderer: (event: SessionEvent) => void;
  sendTerminalClosedToRenderer: (sessionId: string, terminalName: string) => void;
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

// Tracks the "active" terminal per webContents (send/resize target).
const activeByWcId = new Map<number, { sessionId: string; terminalName: string }>();

// In-flight connect promises, keyed by "wcId:sessionId:terminalName".
const pendingConnects = new Map<string, Promise<ConnectResult | ConnectError>>();

function connectKey(wcId: number, sessionId: string, terminalName: string): string {
  return `${wcId}:${sessionId}:${terminalName}`;
}

function terminalWsUrl(sessionId: string, terminalName: string): string {
  const wsBase = DAEMON_URL.replace(/^http/, 'ws');
  return `${wsBase}/ws/session/${encodeURIComponent(sessionId)}/terminal/${encodeURIComponent(terminalName)}`;
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
  terminalName: string,
): void {
  const conn = session.terminals.get(terminalName);
  if (conn) {
    conn.ws.close();
    session.terminals.delete(terminalName);
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

  const active = activeByWcId.get(wcId);
  if (active?.sessionId === sessionId && active?.terminalName === terminalName) {
    activeByWcId.delete(wcId);
  }
}

export function connect(
  sender: WebContents,
  sessionId: string,
  wsUrl: string,
  terminalName: string,
): Promise<ConnectResult | ConnectError> {
  const wcId = sender.id;
  const key = connectKey(wcId, sessionId, terminalName);

  // If this terminal's WS is already open, return success immediately.
  const existing = sessionsByWcId.get(wcId)?.get(sessionId);
  const existingTerminal = existing?.terminals.get(terminalName);
  if (existingTerminal?.ws.readyState === WebSocket.OPEN) {
    return Promise.resolve({ ok: true });
  }

  // If a connect is already in-flight for this terminal, reuse its promise.
  const pending = pendingConnects.get(key);
  if (pending) {
    console.log('[main:session] connect → reusing pending promise', {
      wcId,
      sessionId,
      terminalName,
    });
    return pending;
  }

  console.log('[main:session] connect', { wcId, sessionId, terminalName, wsUrl });

  const sendToRenderer = (sid: string, tName: string, data: Uint8Array | string): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:data', { sessionId: sid, terminalName: tName, data });
    }
  };

  const sendEventToRenderer = (event: SessionEvent): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:event', event);
    }
  };

  const sendTerminalClosedToRenderer = (sid: string, tName: string): void => {
    if (!sender.isDestroyed()) {
      sender.send('session:terminal-closed', { sessionId: sid, terminalName: tName });
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

    // Replace existing terminal connection with same name.
    const oldConn = session.terminals.get(terminalName);
    if (oldConn) {
      console.log('[main:session] connect → replacing existing terminal WS', {
        wcId,
        sessionId,
        terminalName,
      });
      oldConn.ws.close();
    }

    const conn: TerminalConnection = { ws, terminalName };
    session.terminals.set(terminalName, conn);

    // Auto-set as active if no terminal is active for this wcId.
    if (!activeByWcId.has(wcId)) {
      activeByWcId.set(wcId, { sessionId, terminalName });
    }

    ws.addEventListener('open', () => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      if (!stillActive || stillActive.terminals.get(terminalName) !== conn) {
        console.log('[main:session] open fired but session/terminal was replaced — ignoring', {
          wcId,
          sessionId,
          terminalName,
        });
        return;
      }
      console.log('[main:session] open ✓', { wcId, sessionId, terminalName });
      startSse(session, sessionId);
      finish({ ok: true });
      resolve({ ok: true });
    });

    ws.addEventListener('error', (ev) => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      if (!stillActive || stillActive.terminals.get(terminalName) !== conn) return;
      console.warn('[main:session] error', { wcId, sessionId, terminalName, ev });
      cleanupTerminal(wcId, sessionId, stillActive, terminalName);
      finish({ ok: false, message: 'WebSocket connection failed' });
      resolve({ ok: false, message: 'WebSocket connection failed' });
    });

    ws.addEventListener('message', (ev) => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      if (!stillActive || stillActive.terminals.get(terminalName) !== conn) return;
      if (ev.data instanceof ArrayBuffer) {
        sendToRenderer(sessionId, terminalName, new Uint8Array(ev.data));
      } else {
        sendToRenderer(sessionId, terminalName, String(ev.data));
      }
    });

    ws.addEventListener('close', (ev) => {
      const stillActive = sessionsByWcId.get(wcId)?.get(sessionId);
      const wasActive = stillActive && stillActive.terminals.get(terminalName) === conn;
      console.log('[main:session] close', {
        wcId,
        sessionId,
        terminalName,
        wasActive,
        code: ev.code,
        reason: ev.reason,
      });
      if (stillActive && wasActive) {
        stillActive.sendTerminalClosedToRenderer(sessionId, terminalName);
        cleanupTerminal(wcId, sessionId, stillActive, terminalName);
      }
      finish({ ok: false, message: 'WebSocket connection closed' });
    });
  });

  pendingConnects.set(key, promise);
  return promise;
}

export function connectByTerminalName(
  sender: WebContents,
  sessionId: string,
  terminalName: string,
): Promise<ConnectResult | ConnectError> {
  return connect(sender, sessionId, terminalWsUrl(sessionId, terminalName), terminalName);
}

export function disconnect(wcId: number, sessionId?: string, terminalName?: string): void {
  const wcSessions = sessionsByWcId.get(wcId);
  if (!wcSessions) {
    console.log('[main:session] disconnect → no active sessions', { wcId });
    return;
  }

  if (sessionId && terminalName) {
    const session = wcSessions.get(sessionId);
    if (!session) return;
    console.log('[main:session] disconnect terminal', { wcId, sessionId, terminalName });
    cleanupTerminal(wcId, sessionId, session, terminalName);
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
    const active = activeByWcId.get(wcId);
    if (active?.sessionId === sessionId) {
      activeByWcId.delete(wcId);
    }
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
    activeByWcId.delete(wcId);
  }
}

export function setActive(wcId: number, sessionId: string, terminalName: string): void {
  console.log('[main:session] setActive', { wcId, sessionId, terminalName });
  activeByWcId.set(wcId, { sessionId, terminalName });
}

export function send(wcId: number, data: string): void {
  const active = activeByWcId.get(wcId);
  if (!active) {
    console.log('[main:session] send → no active terminal, dropping', { wcId });
    return;
  }
  const session = sessionsByWcId.get(wcId)?.get(active.sessionId);
  const conn = session?.terminals.get(active.terminalName);
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(data);
  }
}

export function resize(wcId: number, cols: number, rows: number): void {
  const active = activeByWcId.get(wcId);
  if (!active) {
    console.log('[main:session] resize → no active terminal, dropping', { wcId, cols, rows });
    return;
  }
  const session = sessionsByWcId.get(wcId)?.get(active.sessionId);
  const conn = session?.terminals.get(active.terminalName);
  if (!conn) {
    console.log('[main:session] resize → terminal not found, dropping', {
      wcId,
      ...active,
      cols,
      rows,
    });
    return;
  }
  if (conn.ws.readyState !== WebSocket.OPEN) {
    console.log('[main:session] resize → WS not open, dropping', {
      wcId,
      ...active,
      cols,
      rows,
      readyState: conn.ws.readyState,
    });
    return;
  }
  console.log('[main:session] resize → sending', { wcId, ...active, cols, rows });
  conn.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}

export function getWsUrl(sessionId: string, terminalName: string): string {
  return terminalWsUrl(sessionId, terminalName);
}
