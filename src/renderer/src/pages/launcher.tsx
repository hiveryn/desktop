import type { AgentProfile } from '@components';
import {
  ArchitectCard,
  BottomBar,
  Caption,
  DevBadge,
  ErrorCenterIndicator,
  ErrorCenterSheet,
  Navigation,
  ProfileSelector,
  Text,
  ToastHost,
} from '@components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useErrorCenterCapture } from '../hooks/useErrorCenterCapture';
import { useShortcutConfig } from '../hooks/useShortcutConfig';
import { useKeyDispatcher } from '../keys/useKeyDispatcher';
import styles from './launcher.module.css';

function shortenPath(path: string, home: string | null): string {
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}

export default function Launcher() {
  const { config: shortcutConfig } = useShortcutConfig();
  useKeyDispatcher(shortcutConfig);
  useErrorCenterCapture();

  const [architects, setArchitects] = useState<Architect[]>([]);
  const [userHome, setUserHome] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [runningSessions, setRunningSessions] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [profilesError, setProfilesError] = useState<unknown | null>(null);

  const [pendingArchitectKey, setPendingArchitectKey] = useState<string | null>(null);
  const [showProfileSelector, setShowProfileSelector] = useState(false);
  const [isSpawning, setIsSpawning] = useState(false);

  const pendingArchitectKeyRef = useRef(pendingArchitectKey);
  useEffect(() => {
    pendingArchitectKeyRef.current = pendingArchitectKey;
  }, [pendingArchitectKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setProfilesError(null);
      const [architectsResult, userHomeResult, sessionsResult, profilesResult] =
        await Promise.allSettled([
          window.hiveryn.architects.list(),
          window.hiveryn.system.getUserHome(),
          window.hiveryn.sessions.list(),
          window.hiveryn.profiles.list(),
        ]);

      if (cancelled) return;

      if (architectsResult.status === 'fulfilled') {
        setArchitects(architectsResult.value);
      }

      if (userHomeResult.status === 'fulfilled') {
        setUserHome(userHomeResult.value);
      }

      if (sessionsResult.status === 'fulfilled') {
        const running = new Set(
          sessionsResult.value
            .filter((s) => s.current_run?.status === 'running')
            .map((s) => s.architect_key),
        );
        setRunningSessions(running);
      }

      if (profilesResult.status === 'fulfilled') {
        setProfiles(profilesResult.value);
      } else {
        setProfilesError(profilesResult.reason);
      }

      setIsLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedArchitects = useMemo(() => {
    return [...architects].sort((a, b) => a.key.localeCompare(b.key));
  }, [architects]);

  const handleOpenArchitect = (key: string) => {
    if (runningSessions.has(key)) {
      // Already captured centrally via the onRequest capture bridge on failure.
      void window.hiveryn.launcher.openArchitect(key).catch(() => {});
    } else {
      if (profilesError) return;
      setPendingArchitectKey(key);
      setShowProfileSelector(true);
    }
  };

  const handleProfileSelect = async (profileName: string): Promise<void> => {
    const key = pendingArchitectKeyRef.current;
    if (!key) return;
    setShowProfileSelector(false);
    setIsSpawning(true);

    try {
      const intent = await window.hiveryn.sessions.create('architect', key);
      await window.hiveryn.sessions.createRun(intent.id, profileName);
      await window.hiveryn.launcher.openArchitect(key);
    } catch {
      // Already captured centrally via the onRequest capture bridge.
      setIsSpawning(false);
    }
  };

  const handleProfileSelectorClose = () => {
    if (!isSpawning) {
      setShowProfileSelector(false);
      setPendingArchitectKey(null);
    }
  };

  return (
    <div className={styles.window}>
      <Navigation className={styles.appbar}>
        <span className={styles.navTitle}>
          <span className={styles.brandMark} aria-hidden="true">
            ▣
          </span>
          <Text as="span" className={styles.brandText}>
            HIVERYN
          </Text>
          <DevBadge />
        </span>
      </Navigation>

      <main className={styles.content}>
        {isLoading ? (
          <div className={styles.centerState}>
            <Caption as="p">Loading architects</Caption>
          </div>
        ) : sortedArchitects.length === 0 ? (
          <div className={styles.centerState}>
            <Text>No architects configured</Text>
          </div>
        ) : (
          <div className={styles.grid}>
            {sortedArchitects.map((architect) => (
              <ArchitectCard
                key={architect.key}
                architect={{
                  ...architect,
                  path: shortenPath(architect.path, userHome),
                }}
                onOpen={handleOpenArchitect}
                isLoading={isSpawning && pendingArchitectKey === architect.key}
                status={runningSessions.has(architect.key) ? 'running' : undefined}
              />
            ))}
          </div>
        )}
      </main>

      <BottomBar className={styles.bottomBarFixed} right={<ErrorCenterIndicator />} />

      <ProfileSelector
        profiles={profiles}
        open={showProfileSelector}
        onSelect={(name: string) => void handleProfileSelect(name)}
        onClose={handleProfileSelectorClose}
      />

      <ToastHost />
      <ErrorCenterSheet />
    </div>
  );
}
