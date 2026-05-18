import { useEffect, useRef } from 'react';
import type { DaemonHealthStatus } from '../../../../../shared/types';
import { restoreSessionsForArchitect } from './sessionSnapshot';

export function useDaemonRecovery(architectKey: string): void {
  const statusRef = useRef<DaemonHealthStatus>('unknown');

  useEffect(() => {
    if (!architectKey) {
      return;
    }

    let cancelled = false;

    void window.hiveryn.daemon.getHealthStatus().then((state) => {
      if (!cancelled) {
        statusRef.current = state.status;
      }
    });

    const unsubscribe = window.hiveryn.daemon.onHealthStatus((state) => {
      const previousStatus = statusRef.current;
      statusRef.current = state.status;
      if (previousStatus !== 'unreachable' || state.status !== 'healthy') {
        return;
      }
      void restoreSessionsForArchitect(architectKey);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [architectKey]);
}
