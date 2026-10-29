import { ArchitectCard, Caption, Dialog, Text } from '@components';
import { useEffect, useMemo, useState } from 'react';
import { useArchitectStatusStore } from '../../../state/architectStatusStore';
import { useArchitectLaunch } from '../sidebar/launchArchitect';
import styles from './ArchitectLauncher.module.css';

function shortenPath(path: string, home: string | null): string {
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}

let userHomeRequest: Promise<string> | null = null;

// Repository keys per architect for the cards (the status listing has none).
function useArchitectRepos(): Record<string, Array<{ key: string }>> {
  const [repos, setRepos] = useState<Record<string, Array<{ key: string }>>>({});
  useEffect(() => {
    let current = true;
    void window.hiveryn.architects
      .list()
      .then((architects) => {
        if (current) {
          setRepos(Object.fromEntries(architects.map((a) => [a.key, a.repos ?? []])));
        }
      })
      .catch(() => {
        // Captured centrally; cards then show no repos.
      });
    return () => {
      current = false;
    };
  }, []);
  return repos;
}

function useUserHome(): string | null {
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    userHomeRequest ??= window.hiveryn.system.getUserHome();
    void userHomeRequest.then((value) => {
      if (current) setHome(value);
    });
    return () => {
      current = false;
    };
  }, []);
  return home;
}

// Every configured architect as a card. Opening one selects its running
// architect session, or picks a variant and launches one (the sidebar's flow).
function ArchitectGrid({ className, onOpened }: { className?: string; onOpened?(): void }) {
  const statuses = useArchitectStatusStore((s) => s.statuses);
  const loaded = useArchitectStatusStore((s) => s.loaded);
  const launchingKey = useArchitectLaunch((s) => s.launchingKey);
  const open = useArchitectLaunch((s) => s.open);
  const home = useUserHome();
  const repos = useArchitectRepos();

  const sorted = useMemo(
    () => [...statuses].sort((a, b) => a.key.localeCompare(b.key)),
    [statuses],
  );

  if (!loaded) {
    return (
      <div className={styles.centerState}>
        <Caption as="p">Loading architects</Caption>
      </div>
    );
  }
  if (sorted.length === 0) {
    return (
      <div className={styles.centerState}>
        <Text>No architects configured</Text>
      </div>
    );
  }
  return (
    <div className={[styles.grid, className].filter(Boolean).join(' ')}>
      {sorted.map((architect) => (
        <ArchitectCard
          key={architect.key}
          architect={{
            key: architect.key,
            name: architect.name,
            path: shortenPath(architect.path, home),
            repos: repos[architect.key],
          }}
          onOpen={() => {
            open(architect);
            onOpened?.();
          }}
          isLoading={launchingKey === architect.key}
          status={architect.session_id ? 'running' : undefined}
        />
      ))}
    </div>
  );
}

// The workspace when no project is selected.
export function ArchitectLauncherView() {
  return (
    <div className={styles.content}>
      <Caption as="p" className={styles.heading}>
        Select an architect in the sidebar, or open one here.
      </Caption>
      <ArchitectGrid />
    </div>
  );
}

// The plus button's dialog.
export function ArchitectLauncherDialog({ onClose }: { onClose(): void }) {
  return (
    <Dialog title="Architects" onCancel={onClose} cancelLabel="CLOSE" isolateKeys>
      <ArchitectGrid className={styles.dialogGrid} onOpened={onClose} />
    </Dialog>
  );
}
