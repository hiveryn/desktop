import { Button, Caption, TerminalPane } from '@hiveryn/components';
import { useEffect, useRef, useState } from 'react';
import styles from './ArchitectTerminal.module.css';

// Approximate Geist Mono cell metrics at fontSize=13px in this layout.
const CHAR_WIDTH = 7.8;
const CHAR_HEIGHT = 17;

interface Props {
  architectKey: string;
  onSessionConnected?: (sessionId: string) => void;
  onSessionDisconnected?: () => void;
}

// idle      → profile selector + Start button
// spawning  → HTTP spawn in flight, button disabled
// connecting → TerminalPane mounted (measuring size), WebSocket being opened
// running   → session live, data flowing
type SpawnState = 'idle' | 'spawning' | 'connecting' | 'running';

interface PendingSession {
  session_id: string;
  ws_url: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export default function ArchitectTerminal({
  architectKey,
  onSessionConnected,
  onSessionDisconnected,
}: Props) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [profilesError, setProfilesError] = useState<string | null>(null);

  const [spawnState, setSpawnState] = useState<SpawnState>('idle');
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);

  const idlePaneRef = useRef<HTMLDivElement | null>(null);
  const writeRef = useRef<((data: string | Uint8Array) => void) | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onSessionConnectedRef = useRef(onSessionConnected);
  const onSessionDisconnectedRef = useRef(onSessionDisconnected);
  // Guards the disconnect effect against React StrictMode's fake unmount:
  // only disconnect if .then() actually completed (connectedRef becomes true
  // after connect resolves, which is after the fake unmount fires).
  const connectedRef = useRef(false);

  useEffect(() => {
    onSessionConnectedRef.current = onSessionConnected;
    onSessionDisconnectedRef.current = onSessionDisconnected;
  }, [onSessionConnected, onSessionDisconnected]);

  useEffect(() => {
    let cancelled = false;
    window.hiveryn.profiles
      .list()
      .then((list) => {
        if (cancelled) return;
        setProfiles(list ?? []);
        if (list.length > 0) setSelectedProfile(list[0].name);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProfilesError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Effect 1 — register the session:data listener as soon as the terminal is
  // visible. Depends on terminalVisible (not spawnState) so the listener is
  // never torn down during the connecting→running transition, which is exactly
  // when the daemon sends the SIGWINCH redraw burst.
  const terminalVisible = spawnState === 'connecting' || spawnState === 'running';
  useEffect(() => {
    if (!terminalVisible) return;
    return window.hiveryn.session.onData((data) => {
      writeRef.current?.(data);
    });
  }, [terminalVisible]);

  // Effect 2 — open the WebSocket only after Effect 1 has registered the
  // listener so no data arrives before we're ready to receive it.
  useEffect(() => {
    if (spawnState !== 'connecting' || !pendingSession) return;
    let cancelled = false;

    console.log('[AT] connect effect starting', { sessionId: pendingSession.session_id });
    window.hiveryn.session
      .connect(pendingSession.session_id, pendingSession.ws_url)
      .then(() => {
        if (cancelled) {
          console.log('[AT] connect resolved but effect cancelled — skipping post-connect resize');
          return;
        }
        console.log('[AT] connect resolved ✓', { lastSize: lastSizeRef.current });
        connectedRef.current = true;
        onSessionConnectedRef.current?.(pendingSession.session_id);
        if (lastSizeRef.current) {
          console.log('[AT] sending post-connect resize', lastSizeRef.current);
          window.hiveryn.session.resize(lastSizeRef.current.cols, lastSizeRef.current.rows);
        } else {
          console.warn('[AT] post-connect: no lastSizeRef — SIGWINCH will not be sent!');
        }
        setSpawnState('running');
        setPendingSession(null);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          console.log('[AT] connect rejected but effect cancelled — ignoring', err);
          return;
        }
        console.warn('[AT] connect rejected', err);
        setSpawnError(
          (err as { status?: number }).status === 409
            ? 'Architect is already running'
            : errorMessage(err),
        );
        setSpawnState('idle');
        setPendingSession(null);
      });

    return () => {
      cancelled = true;
    };
  }, [spawnState, pendingSession]);

  useEffect(() => {
    return () => {
      if (connectedRef.current) {
        connectedRef.current = false;
        onSessionDisconnectedRef.current?.();
        void window.hiveryn.session.disconnect();
      }
    };
  }, []);

  function estimateTerminalSize(): { cols: number; rows: number } {
    const container = idlePaneRef.current;
    if (!container) {
      console.log('[AT] estimateTerminalSize: no container ref, returning zeros');
      return { cols: 0, rows: 0 };
    }

    const width = container.offsetWidth;
    const height = container.offsetHeight;
    const cols = Math.max(0, Math.floor(width / CHAR_WIDTH));
    const rows = Math.max(0, Math.floor(height / CHAR_HEIGHT));
    console.log('[AT] estimateTerminalSize:', { width, height, cols, rows });
    return { cols, rows };
  }

  async function handleStart() {
    if (!architectKey || !selectedProfile) return;
    setSpawnState('spawning');
    setSpawnError(null);

    try {
      const { cols, rows } = estimateTerminalSize();
      console.log('[AT] spawning with', { architectKey, profile: selectedProfile, cols, rows });
      const result = await window.hiveryn.architects.spawn(
        architectKey,
        selectedProfile,
        cols,
        rows,
      );
      console.log('[AT] spawn result', result);
      setSpawnState('connecting');
      setPendingSession(result);
    } catch (err: unknown) {
      console.warn('[AT] spawn failed', err);
      setSpawnError(
        (err as { status?: number }).status === 409
          ? 'Architect is already running'
          : errorMessage(err),
      );
      setSpawnState('idle');
    }
  }

  if (terminalVisible) {
    return (
      <TerminalPane
        className={styles.terminal}
        onWrite={(fn: (data: string | Uint8Array) => void) => {
          console.log('[AT] onWrite registered (terminal write fn ready)');
          writeRef.current = fn;
        }}
        onData={(data: string) => window.hiveryn.session.send(data)}
        onResize={(cols: number, rows: number) => {
          console.log('[AT] onResize from TerminalPane', { cols, rows });
          lastSizeRef.current = { cols, rows };
          window.hiveryn.session.resize(cols, rows);
        }}
      />
    );
  }

  return (
    <div ref={idlePaneRef} className={styles.idlePane}>
      {profilesError ? (
        <Caption className={styles.error}>{profilesError}</Caption>
      ) : profiles.length === 0 ? (
        <Caption>No agent profiles configured</Caption>
      ) : (
        <>
          <select
            className={styles.profileSelect}
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            disabled={spawnState === 'spawning'}
            aria-label="Agent profile"
          >
            {profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <Button onClick={handleStart} isDisabled={spawnState === 'spawning' || !selectedProfile}>
            {spawnState === 'spawning' ? 'Starting…' : 'Start'}
          </Button>
          {spawnError && <Caption className={styles.error}>{spawnError}</Caption>}
        </>
      )}
    </div>
  );
}
