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
import styles from './architect-window.module.css';

function readArchitectKey(): string {
  const prefix = '#/architect/';
  const hash = window.location.hash;
  if (!hash.startsWith(prefix)) {
    return '';
  }
  return decodeURIComponent(hash.slice(prefix.length));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!architectKey) {
        setError('Missing architect key');
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
        setError(errorMessage(architectResult.reason));
      }

      if (homeResult.status === 'fulfilled') {
        setHome(homeResult.value.home);
      }
    }

    loadData();
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
        {error ? (
          <Text className={styles.error}>{error}</Text>
        ) : (
          <Caption as="p">(empty - terminal + kanban later)</Caption>
        )}
      </main>

      <BottomBar left={<Caption>● daemon connected</Caption>} right={<ThemeSwitcher />} />
    </div>
  );
}
