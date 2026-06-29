import { useEffect, useState } from 'react';

export type ShortcutConfig = Record<string, Record<string, string>>;

export interface ShortcutConfigState {
  config: ShortcutConfig | null;
  error: unknown | null;
}

const REQUIRED_SECTIONS = ['global', 'kanban', 'event-log'] as const;

export function useShortcutConfig(): ShortcutConfigState {
  const [config, setConfig] = useState<ShortcutConfig | null>(null);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    function load(): void {
      // Re-register the OS-global palette shortcut (main process) so edits to
      // shortcuts.yaml take effect on the same focus-driven refresh that reloads
      // the in-app bindings below. Idempotent: main unregisters then re-registers.
      void window.hiveryn.globalShortcut.reload();
      window.hiveryn.config
        .getShortcuts()
        .then((raw) => {
          for (const section of REQUIRED_SECTIONS) {
            if (!raw?.[section]) {
              setConfig(null);
              setError(
                new Error(
                  `[shortcuts] daemon returned incomplete config (missing section: "${section}") — keyboard shortcuts disabled`,
                ),
              );
              return;
            }
          }
          setError(null);
          setConfig(raw);
        })
        .catch((err: unknown) => {
          setConfig(null);
          setError(err);
        });
    }

    load();
    // Refetch when the window regains focus so daemon-side edits to
    // ~/.hiveryn/shortcuts.yaml flow in without a manual reload.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  return { config, error };
}
