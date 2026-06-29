import type { TicketBoard } from '@hiveryn/shared/domain';
import { useCallback, useEffect, useState } from 'react';
import {
  type Architect,
  STREAM_CONNECTED_EVENT_TYPE,
  WORKSPACE_CHANGED_EVENT_TYPE,
} from '../../../../../shared/types';

const EMPTY_TICKET_BOARD: TicketBoard = { backlog: [], progress: [], done: [] };

export interface ArchitectData {
  architect: Architect | null;
  // The user's OS home dir — used for ~-shortening paths in the nav.
  userHome: string | null;
  board: TicketBoard;
  boardLoading: boolean;
  boardError: unknown | null;
  loadError: unknown | null;
  refreshArchitect(): Promise<void>;
  refreshBoard(): Promise<void>;
}

export function useArchitectData(architectKey: string): ArchitectData {
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [userHome, setUserHome] = useState<string | null>(null);
  const [board, setBoard] = useState<TicketBoard>(EMPTY_TICKET_BOARD);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<unknown | null>(null);
  const [loadError, setLoadError] = useState<unknown | null>(null);

  const refreshArchitect = useCallback(async () => {
    if (!architectKey) return;
    const next = await window.hiveryn.architects.get(architectKey);
    setArchitect(next);
  }, [architectKey]);

  const refreshBoard = useCallback(async () => {
    if (!architectKey) return;
    try {
      const next = await window.hiveryn.tickets.list(architectKey);
      setBoard(next);
      setBoardError(null);
    } catch (error: unknown) {
      setBoardError(error);
    }
  }, [architectKey]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!architectKey) {
        setLoadError('Missing architect key');
        setBoardLoading(false);
        return;
      }

      setLoadError(null);
      setBoardError(null);
      setBoardLoading(true);

      const [architectResult, userHomeResult, boardResult] = await Promise.allSettled([
        window.hiveryn.architects.get(architectKey),
        window.hiveryn.system.getUserHome(),
        window.hiveryn.tickets.list(architectKey),
      ]);

      if (cancelled) return;

      if (architectResult.status === 'fulfilled') {
        setArchitect(architectResult.value);
      } else {
        setLoadError(architectResult.reason);
      }

      if (userHomeResult.status === 'fulfilled') {
        setUserHome(userHomeResult.value);
      }

      if (boardResult.status === 'fulfilled') {
        setBoard(boardResult.value);
      } else {
        setBoard(EMPTY_TICKET_BOARD);
        setBoardError(boardResult.reason);
      }

      setBoardLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [architectKey]);

  useEffect(() => {
    if (!architectKey) return;
    return window.hiveryn.architects.subscribeEvents(architectKey, (event) => {
      // A real daemon change, or a (re)connect signal telling us to reconcile —
      // both warrant a full refetch so a missed event can't leave us stale.
      if (
        event.type !== WORKSPACE_CHANGED_EVENT_TYPE &&
        event.type !== STREAM_CONNECTED_EVENT_TYPE
      ) {
        return;
      }
      void refreshArchitect();
      void refreshBoard();
    });
  }, [architectKey, refreshArchitect, refreshBoard]);

  return {
    architect,
    userHome,
    board,
    boardLoading,
    boardError,
    loadError,
    refreshArchitect,
    refreshBoard,
  };
}
