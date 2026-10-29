import { useEffect, useRef } from 'react';
import type { DaemonHealthStatus } from '../../../../../shared/types';
import { useErrorCenterStore } from '../../../state/errorCenterStore';
import { useSessionStore } from '../../../state/sessionStore';
import { syncSessionsForArchitect } from './sessionSnapshot';

// Window-level: one error per outage, and one resync of every open project when
// the daemon comes back (the per-project event streams are re-opened by the
// main process and resync on their own stream_connected too).
export function useDaemonRecovery(): void {
  const statusRef = useRef<DaemonHealthStatus>('unknown');

  useEffect(() => {
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
        useErrorCenterStore.getState().pushError({
          title: 'Daemon health',
          message: 'Daemon unreachable',
          timestamp: Date.now(),
        });
      }

      if (previousStatus !== 'unreachable' || state.status !== 'healthy') {
        return;
      }
      for (const architectKey of useSessionStore.getState().openArchitects) {
        void syncSessionsForArchitect(architectKey);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
}
