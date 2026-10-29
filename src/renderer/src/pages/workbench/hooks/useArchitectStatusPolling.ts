import { useEffect } from 'react';
import { useArchitectStatusStore } from '../../../state/architectStatusStore';
import { useSessionStore } from '../../../state/sessionStore';
import { selectArchitect } from '../navigation';

// How often the sidebar's architect/session list is re-read. Sessions of open
// projects also refresh it as they appear and end.
const STATUS_POLL_INTERVAL_MS = 3000;

const LAST_PROJECT_STORAGE_KEY = 'hiveryn.workbench.lastProject';

function readLastProject(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_PROJECT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeLastProject(architectKey: string): void {
  try {
    globalThis.localStorage?.setItem(LAST_PROJECT_STORAGE_KEY, architectKey);
  } catch {
    // Storage unavailable: the window just opens on the launcher view.
  }
}

// Keeps the sidebar list current, and reopens the project last shown in this
// window when it still has running sessions (a per-viewer convenience).
export function useArchitectStatusPolling(): void {
  const refresh = useArchitectStatusStore((s) => s.refresh);
  const sessionIds = useSessionStore((s) => Object.keys(s.sessions).sort().join(','));
  const selectedArchitectKey = useSessionStore((s) => s.selectedArchitectKey);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionIds is the trigger — a session appeared or ended.
  useEffect(() => {
    void refresh();
  }, [sessionIds, refresh]);

  useEffect(() => {
    if (selectedArchitectKey) writeLastProject(selectedArchitectKey);
  }, [selectedArchitectKey]);

  useEffect(() => {
    const last = readLastProject();
    if (!last) return;
    let done = false;
    const restore = (): void => {
      const { statuses, loaded } = useArchitectStatusStore.getState();
      if (done || !loaded) return;
      done = true;
      unsubscribe();
      if (useSessionStore.getState().selectedArchitectKey !== null) return;
      const status = statuses.find((candidate) => candidate.key === last);
      if (status && (status.session_id || status.sessions.length > 0)) selectArchitect(last);
    };
    const unsubscribe = useArchitectStatusStore.subscribe(restore);
    restore();
    return () => {
      done = true;
      unsubscribe();
    };
  }, []);
}
