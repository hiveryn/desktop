import { useEffect, useState } from 'react';
import { useErrorCenterStore } from '../state/errorCenterStore';

export type ShortcutConfig = Record<string, Record<string, string>>;

export interface ShortcutConfigState {
  config: ShortcutConfig | null;
}

const REQUIRED_SECTIONS = ['global', 'kanban', 'event-log'] as const;

export function useShortcutConfig(): ShortcutConfigState {
  const [config, setConfig] = useState<ShortcutConfig | null>(null);

  useEffect(() => {
    function load(): void {
      window.hiveryn.config
        .getShortcuts()
        .then((raw) => {
          for (const section of REQUIRED_SECTIONS) {
            if (!raw?.[section]) {
              setConfig(null);
              // A 200 with an incomplete config never rejects invoke(), so it
              // never reaches the app-wide onRequest capture bridge — push it
              // directly here instead.
              const entry = {
                title: 'Shortcut Config',
                message: `daemon returned incomplete config (missing section: "${section}") — keyboard shortcuts disabled`,
                timestamp: Date.now(),
              };
              useErrorCenterStore.getState().pushError(entry);
              return;
            }
          }
          setConfig(raw);
        })
        .catch(() => {
          // invoke() rejections already flow through the onRequest capture bridge.
          setConfig(null);
        });
    }

    load();
    // Refetch when the window regains focus so daemon-side edits to
    // ~/.hiveryn/shortcuts.yaml flow in without a manual reload.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  return { config };
}
