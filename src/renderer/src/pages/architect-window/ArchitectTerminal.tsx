import type { AgentProfile } from '@hiveryn/components';
import { Button, Caption, ProfileSelector } from '@hiveryn/components';
import { useEffect, useRef, useState } from 'react';
import styles from './ArchitectTerminal.module.css';
import SessionTerminal from './SessionTerminal';

// Approximate Geist Mono cell metrics at fontSize=13px in this layout.
const CHAR_WIDTH = 7.8;
const CHAR_HEIGHT = 17;

interface Props {
  architectKey: string;
  visible?: boolean;
  onSessionConnected?: (sessionId: string, wsUrl: string) => void;
  onSessionDisconnected?: () => void;
}

// idle      → profile selector + Start button
// spawning  → HTTP spawn in flight, button disabled
// connecting → SessionTerminal mounted, WebSocket being opened
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
  visible = true,
  onSessionConnected,
  onSessionDisconnected,
}: Props) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [profilesError, setProfilesError] = useState<string | null>(null);

  const [showProfileSelector, setShowProfileSelector] = useState(false);
  const [spawnState, setSpawnState] = useState<SpawnState>('idle');
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);

  const idlePaneRef = useRef<HTMLDivElement | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const onSessionConnectedRef = useRef(onSessionConnected);
  const onSessionDisconnectedRef = useRef(onSessionDisconnected);

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
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProfilesError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore a running session on mount — handles both initial load (app
  // relaunch with an existing session) and responsive layout changes that
  // unmount/remount the terminal component in a different DOM subtree.
  useEffect(() => {
    let cancelled = false;
    window.hiveryn.sessions
      .list()
      .then((sessions) => {
        if (cancelled) return;
        const running = sessions.find(
          (s) => s.status === 'running' && s.architect_key === architectKey,
        );
        if (running) {
          setPendingSession({ session_id: running.id, ws_url: running.ws_url });
          setSpawnState('connecting');
        }
      })
      .catch(() => {
        // Non-fatal — user can start a new session.
      });
    return () => {
      cancelled = true;
    };
  }, [architectKey]);

  function estimateTerminalSize(): { cols: number; rows: number } {
    const container = idlePaneRef.current;
    if (!container) return { cols: 0, rows: 0 };

    const width = container.offsetWidth;
    const height = container.offsetHeight;
    const cols = Math.max(0, Math.floor(width / CHAR_WIDTH));
    const rows = Math.max(0, Math.floor(height / CHAR_HEIGHT));
    return { cols, rows };
  }

  function handleProfileSelect(profileName: string): void {
    setShowProfileSelector(false);
    void handleStart(profileName);
  }

  async function handleStart(profileName: string): Promise<void> {
    if (!architectKey || !profileName) return;
    setSpawnState('spawning');
    setSpawnError(null);

    try {
      const { cols, rows } = estimateTerminalSize();
      lastSizeRef.current = { cols, rows };
      const result = await window.hiveryn.architects.spawn(architectKey, profileName, cols, rows);
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

  const terminalVisible = spawnState === 'connecting' || spawnState === 'running';

  if (terminalVisible && pendingSession) {
    return (
      <SessionTerminal
        sessionId={pendingSession.session_id}
        wsUrl={pendingSession.ws_url}
        terminalName="main"
        className={styles.terminal}
        visible={visible}
        onConnected={(sessionId) => {
          setSpawnState('running');
          onSessionConnectedRef.current?.(sessionId, pendingSession.ws_url);
        }}
        onDisconnected={() => {
          setPendingSession(null);
          setSpawnState('idle');
          onSessionDisconnectedRef.current?.();
        }}
      />
    );
  }

  return (
    <div
      ref={idlePaneRef}
      className={styles.idlePane}
      style={{ display: visible ? undefined : 'none' }}
    >
      {profilesError ? (
        <Caption className={styles.error}>{profilesError}</Caption>
      ) : profiles.length === 0 ? (
        <Caption>No agent profiles configured</Caption>
      ) : (
        <>
          <Button
            onClick={() => setShowProfileSelector(true)}
            isDisabled={spawnState === 'spawning'}
          >
            {spawnState === 'spawning' ? 'Starting…' : 'Start'}
          </Button>
          {spawnError && <Caption className={styles.error}>{spawnError}</Caption>}
        </>
      )}
      <ProfileSelector
        profiles={profiles}
        open={showProfileSelector}
        onSelect={handleProfileSelect}
        onClose={() => setShowProfileSelector(false)}
      />
    </div>
  );
}
