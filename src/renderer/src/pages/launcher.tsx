import {
  ArchitectCard,
  BottomBar,
  Caption,
  Navigation,
  Text,
  ThemeSwitcher,
} from '@hiveryn/components';
import { useEffect, useMemo, useState } from 'react';
import styles from './launcher.module.css';

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

export default function Launcher() {
  const [architects, setArchitects] = useState<Architect[]>([]);
  const [home, setHome] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      const [architectsResult, homeResult] = await Promise.allSettled([
        window.hiveryn.architects.list(),
        window.hiveryn.system.getHome(),
      ]);

      if (cancelled) return;

      if (architectsResult.status === 'fulfilled') {
        setArchitects(architectsResult.value);
      } else {
        setError(errorMessage(architectsResult.reason));
      }

      if (homeResult.status === 'fulfilled') {
        setHome(homeResult.value.home);
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

  const handleOpenArchitect = async (key: string) => {
    setError(null);
    try {
      await window.hiveryn.launcher.openArchitect(key);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className={styles.window}>
      <Navigation>
        <Text as="span" className={styles.navTitle}>
          Hiveryn
        </Text>
      </Navigation>

      <main className={styles.content}>
        {error && <Text className={styles.error}>{error}</Text>}

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
                architect={{ ...architect, path: shortenPath(architect.path, home) }}
                onOpen={handleOpenArchitect}
              />
            ))}
          </div>
        )}
      </main>

      <BottomBar right={<ThemeSwitcher />} />
    </div>
  );
}
