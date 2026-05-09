import {
  BottomBar,
  Caption,
  Glyph,
  IconButton,
  Navigation,
  Plus,
  Text,
  ThemeSwitcher,
} from '@hiveryn/components';
import { useEffect, useMemo, useState } from 'react';
import ArchitectTerminal from './ArchitectTerminal';
import styles from './index.module.css';

function readArchitectKey(): string {
  const prefix = '#/architect/';
  const hash = window.location.hash;
  if (!hash.startsWith(prefix)) return '';
  return decodeURIComponent(hash.slice(prefix.length));
}

function shortenPath(path: string, home: string | null): string {
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}

export default function ArchitectWindow() {
  const architectKey = useMemo(readArchitectKey, []);
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!architectKey) {
        setLoadError('Missing architect key');
        return;
      }

      const [architectResult, homeResult] = await Promise.allSettled([
        window.hiveryn.architects.get(architectKey),
        window.hiveryn.system.getHome(),
      ]);

      if (cancelled) return;

      if (architectResult.status === 'fulfilled') {
        setArchitect(architectResult.value);
      } else {
        setLoadError(
          architectResult.reason instanceof Error
            ? architectResult.reason.message
            : 'Failed to load architect',
        );
      }

      if (homeResult.status === 'fulfilled') {
        setHome(homeResult.value.home);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [architectKey]);

  return (
    <div className={styles.window}>
      <Navigation
        right={
          <IconButton
            onClick={() => window.hiveryn.architect.openLauncher()}
            aria-label="Open launcher"
          >
            <Glyph>
              <Plus />
            </Glyph>
          </IconButton>
        }
      >
        <div className={styles.navTitle}>
          <Text as="span" className={styles.architectTitle}>
            {architect?.key.toUpperCase() ?? 'ARCHITECT'}
          </Text>
          <Caption>{architect ? shortenPath(architect.path, home) : ''}</Caption>
        </div>
      </Navigation>

      <main className={styles.content}>
        {loadError ? (
          <Text className={styles.error}>{loadError}</Text>
        ) : (
          <div className={styles.splitPane}>
            <div className={styles.leftPane}>
              <ArchitectTerminal architectKey={architectKey} />
            </div>
            <div className={styles.rightPane} />
          </div>
        )}
      </main>

      <BottomBar left={<Caption>● daemon connected</Caption>} right={<ThemeSwitcher />} />
    </div>
  );
}
