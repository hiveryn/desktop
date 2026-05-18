import { useEffect, useState } from 'react';

export type ShortcutConfig = Record<string, Record<string, string>>;

const REQUIRED_SECTIONS = ['global', 'kanban', 'event-log'] as const;

export function useShortcutConfig(): ShortcutConfig | null {
  const [config, setConfig] = useState<ShortcutConfig | null>(null);

  useEffect(() => {
    function load(): void {
      window.hiveryn.config
        .getShortcuts()
        .then((raw) => {
          for (const section of REQUIRED_SECTIONS) {
            if (!raw?.[section]) {
              console.error(
                `[shortcuts] daemon returned incomplete config (missing section: "${section}") — keyboard shortcuts disabled`,
              );
              return;
            }
          }
          setConfig(raw);
        })
        .catch((err: unknown) => {
          console.error('[shortcuts] failed to load shortcuts config:', err);
        });
    }

    load();
    // Refetch when the window regains focus so daemon-side edits to
    // ~/.hiveryn/shortcuts.yaml flow in without a manual reload.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  return config;
}
