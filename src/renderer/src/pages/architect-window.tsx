import { BottomBar, Caption, Navigation, Text, ThemeSwitcher } from '@hiveryn/components';
import { useEffect, useMemo, useState } from 'react';
import styles from './architect-window.module.css';

function readArchitectId(): string {
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

export default function ArchitectWindow() {
  const architectId = useMemo(readArchitectId, []);
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadArchitect() {
      if (!architectId) {
        setError('Missing architect id');
        return;
      }

      try {
        const nextArchitect = await window.hiveryn.architects.get(architectId);
        if (!cancelled) {
          setArchitect(nextArchitect);
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err));
        }
      }
    }

    loadArchitect();
    return () => {
      cancelled = true;
    };
  }, [architectId]);

  return (
    <div className={styles.window}>
      <Navigation>
        <div className={styles.navTitle}>
          <Text as="span" className={styles.architectTitle}>
            {architect?.title.toUpperCase() ?? 'ARCHITECT'}
          </Text>
          <Caption>{architect?.path ?? ''}</Caption>
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
