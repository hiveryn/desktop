import { useEffect, useRef } from 'react';
import type { DaemonHealthStatus } from '../../../../../shared/types';
import { useErrorCenterStore } from '../../../state/errorCenterStore';
import { syncSessionsForArchitect } from './sessionSnapshot';

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

      if (previousStatus !== 'unreachable' && state.status === 'unreachable') {
        const entry = {
          title: 'Daemon health',
          message: 'Daemon unreachable',
          timestamp: Date.now(),
        };
        useErrorCenterStore.getState().pushError(entry);
      }

      if (previousStatus !== 'unreachable' || state.status !== 'healthy') {
        return;
      }
      void syncSessionsForArchitect(architectKey);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [architectKey]);
}
