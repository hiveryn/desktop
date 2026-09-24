import type { ActionList, ActionRun } from '@hiveryn/shared/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaemonHealthStatus } from '../../../../../shared/types';
import { syncActionSessions } from './actionSessions';

// How many executions the history shows. Execution records are never pruned
// daemon-side; the window shows the most recent ones.
const HISTORY_LIMIT = 200;

export interface ActionsData {
  list: ActionList | null;
  runs: ActionRun[];
  loadError: unknown | null;
  refresh(): Promise<void>;
}

/**
 * The Actions window's daemon state: the action library, execution history
 * and the running action sessions. Everything is refetched on mount, on every
 * actions-stream event (an execution started or ended), on stream reconnect
 * and on daemon recovery — the stream has no backlog, so a refetch is the only
 * reconciliation.
 */
export function useActionsData(): ActionsData {
  const [list, setList] = useState<ActionList | null>(null);
  const [runs, setRuns] = useState<ActionRun[]>([]);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [nextList, nextRuns] = await Promise.all([
        window.hiveryn.actions.list(),
        window.hiveryn.actions.runs(undefined, HISTORY_LIMIT),
      ]);
      if (!mounted.current) return;
      setList(nextList);
      setRuns(nextRuns);
      setLoadError(null);
      await syncActionSessions(nextRuns);
    } catch (error) {
      // Already captured by the error center through the request bridge.
      if (mounted.current) setLoadError(error);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const unsubscribe = window.hiveryn.actions.subscribeEvents(() => {
      void refresh();
    });

    let status: DaemonHealthStatus = 'unknown';
    const unsubscribeHealth = window.hiveryn.daemon.onHealthStatus((state) => {
      const previous = status;
      status = state.status;
      if (previous === 'unreachable' && state.status === 'healthy') void refresh();
    });

    // Rereading the definitions on focus picks up action.yaml / KICKOFF.md
    // edits made outside Hiveryn.
    const onFocus = (): void => void refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      mounted.current = false;
      unsubscribe();
      unsubscribeHealth();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { list, runs, loadError, refresh };
}
