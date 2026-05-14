import { TerminalPane } from '@hiveryn/components';
import { useEffect, useRef, useState } from 'react';

interface Props {
  sessionId: string;
  terminalId: string;
  className?: string;
  visible?: boolean;
  onConnected?: (sessionId: string) => void;
  onDisconnected?: () => void;
}

export default function SessionTerminal({
  sessionId,
  terminalId,
  className,
  visible = true,
  onConnected,
  onDisconnected,
}: Props) {
  const [error, setError] = useState<string | null>(null);
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
        setError(
          (err as { status?: number }).status === 409
            ? 'Session is already running'
            : err instanceof Error
              ? err.message
              : 'Connection failed',
        );
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
        <span
          style={{
            color: 'var(--ansi-9-red)',
            fontFamily: 'var(--font-family-mono)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </span>
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
      />
    </div>
  );
}
