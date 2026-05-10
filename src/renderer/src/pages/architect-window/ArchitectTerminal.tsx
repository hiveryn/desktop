import { Button, Caption, TerminalPane } from '@hiveryn/components';
import { useEffect, useRef, useState } from 'react';
import styles from './ArchitectTerminal.module.css';

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

  const writeRef = useRef<((data: string) => void) | null>(null);
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

    window.hiveryn.session
      .connect(pendingSession.session_id, pendingSession.ws_url)
      .then(() => {
        if (cancelled) return;
        connectedRef.current = true;
        onSessionConnectedRef.current?.(pendingSession.session_id);
        if (lastSizeRef.current) {
          window.hiveryn.session.resize(lastSizeRef.current.cols, lastSizeRef.current.rows);
        }
        setSpawnState('running');
        setPendingSession(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
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

  async function handleStart() {
    if (!architectKey || !selectedProfile) return;
    setSpawnState('spawning');
    setSpawnError(null);

    try {
      const result = await window.hiveryn.architects.spawn(architectKey, selectedProfile);
      setSpawnState('connecting');
      setPendingSession(result);
    } catch (err: unknown) {
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
        onWrite={(fn: (data: string) => void) => {
          writeRef.current = fn;
        }}
        onData={(data: string) => window.hiveryn.session.send(data)}
        onResize={(cols: number, rows: number) => {
          lastSizeRef.current = { cols, rows };
          window.hiveryn.session.resize(cols, rows);
        }}
      />
    );
  }

  return (
    <div className={styles.idlePane}>
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
