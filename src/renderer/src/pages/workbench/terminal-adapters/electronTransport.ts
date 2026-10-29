import type { TerminalTransport } from '../../../terminal';

// Binds the Electron window.hiveryn.session IPC bridge to the module's
// transport-agnostic TerminalTransport interface. sessionId/terminalId are
// closed over here so the terminal module never sees routing ids, and the
// per-(session,terminal) filtering lives in this adapter.
export function makeElectronTransport(sessionId: string, terminalId: string): TerminalTransport {
  return {
    // Attach-time size handshake: the daemon resizes the PTY to our grid before
    // streaming starts, so PTY ↔ xterm reconcile on every (re)connect.
    connect(size) {
      return window.hiveryn.session.connect(sessionId, terminalId, size);
    },
    send(data) {
      window.hiveryn.session.send(sessionId, terminalId, data);
    },
    resize(cols, rows) {
      window.hiveryn.session.resize(sessionId, terminalId, cols, rows);
    },
    onData(cb) {
      return window.hiveryn.session.onData(({ sessionId: sid, terminalId: tid, data }) => {
        if (sid !== sessionId || tid !== terminalId) return;
        cb(data);
      });
    },
    onClosed(cb) {
      return window.hiveryn.session.onTerminalClosed(({ sessionId: sid, terminalId: tid }) => {
        if (sid !== sessionId || tid !== terminalId) return;
        cb();
      });
    },
  };
}
