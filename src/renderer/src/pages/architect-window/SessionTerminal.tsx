import { ApiEnvelopeError, TerminalPane } from '@components';
import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../state/sessionStore';

interface Props {
  sessionId: string;
  terminalId: string;
  // The logical pane identifier that this terminal should claim when its
  // textarea receives DOM focus (e.g., 'main-terminal' or
  // `right-terminal:${terminalId}`). Keeps focusedPane state in sync with
  // user mouse clicks, not just programmatic focus transitions.
  paneId: string;
  className?: string;
  visible?: boolean;
  focused?: boolean;
  onConnected?: (sessionId: string) => void;
  onDisconnected?: () => void;
}

export default function SessionTerminal({
  sessionId,
  terminalId,
  paneId,
  className,
  visible = true,
  focused = true,
  onConnected,
  onDisconnected,
}: Props) {
  const [error, setError] = useState<unknown | null>(null);
  const writeRef = useRef<((data: string | Uint8Array) => void) | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);

  useEffect(() => {
    onConnectedRef.current = onConnected;
    onDisconnectedRef.current = onDisconnected;
  });

  useEffect(() => {
    return window.hiveryn.session.onData(({ sessionId: sid, terminalId: tid, data }) => {
      if (sid !== sessionId || tid !== terminalId) return;
      writeRef.current?.(data);
    });
  }, [sessionId, terminalId]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        await window.hiveryn.session.connect(sessionId, terminalId);
        if (cancelled) return;
        if (lastSizeRef.current) {
          window.hiveryn.session.resize(
            sessionId,
            terminalId,
            lastSizeRef.current.cols,
            lastSizeRef.current.rows,
          );
        }
        onConnectedRef.current?.(sessionId);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err);
        onDisconnectedRef.current?.();
      }
    }

    connect();

    return () => {
      cancelled = true;
    };
  }, [sessionId, terminalId]);

  useEffect(() => {
    return window.hiveryn.session.onTerminalClosed(({ sessionId: sid, terminalId: tid }) => {
      if (sid !== sessionId || tid !== terminalId) return;
      onDisconnectedRef.current?.();
    });
  }, [sessionId, terminalId]);

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          display: visible ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ApiEnvelopeError error={error} title="Terminal Connection Error" />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: visible ? 'flex' : 'none',
        minHeight: 0,
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <TerminalPane
        className={className}
        visible={visible}
        focused={focused}
        style={{ flex: 1, minHeight: 0, height: 'auto' }}
        onWrite={(fn: (data: string | Uint8Array) => void) => {
          writeRef.current = fn;
        }}
        onData={(data: string) => window.hiveryn.session.send(sessionId, terminalId, data)}
        onResize={(cols: number, rows: number) => {
          if (cols <= 0 || rows <= 0) return;
          lastSizeRef.current = { cols, rows };
          window.hiveryn.session.resize(sessionId, terminalId, cols, rows);
        }}
        onTextAreaFocus={() => {
          const state = useSessionStore.getState();
          if (state.focusedPane !== paneId) state.setFocusedPane(paneId);
        }}
      />
    </div>
  );
}
