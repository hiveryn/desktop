import { useCallback, useEffect, useState } from 'react';
import type { Architect, TicketBoard } from '../../../../../shared/types';

const EMPTY_TICKET_BOARD: TicketBoard = { backlog: [], progress: [], done: [] };

export interface ArchitectData {
  architect: Architect | null;
  home: string | null;
  board: TicketBoard;
  boardLoading: boolean;
  boardError: string | null;
  loadError: string | null;
  refreshBoard(): Promise<void>;
}

export function useArchitectData(architectKey: string): ArchitectData {
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const [board, setBoard] = useState<TicketBoard>(EMPTY_TICKET_BOARD);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshBoard = useCallback(async () => {
    if (!architectKey) return;
    try {
      const next = await window.hiveryn.tickets.list(architectKey);
      setBoard(next);
      setBoardError(null);
    } catch (error: unknown) {
      setBoardError(error instanceof Error ? error.message : 'Failed to refresh tickets');
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

      const [architectResult, homeResult, boardResult] = await Promise.allSettled([
        window.hiveryn.architects.get(architectKey),
        window.hiveryn.system.getHome(),
        window.hiveryn.tickets.list(architectKey),
      ]);

      if (cancelled) return;

      if (architectResult.status === 'fulfilled') {
        setArchitect(architectResult.value);
      } else {
        setLoadError(
          architectResult.reason instanceof Error
            ? architectResult.reason.message
            : 'Failed to load architect',
        );
      }

      if (homeResult.status === 'fulfilled') {
        setHome(homeResult.value.home);
      }

      if (boardResult.status === 'fulfilled') {
        setBoard(boardResult.value);
      } else {
        setBoard(EMPTY_TICKET_BOARD);
        setBoardError(
          boardResult.reason instanceof Error
            ? boardResult.reason.message
            : 'Failed to load tickets',
        );
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
      if (event.type !== 'workspace_changed') return;
      void refreshBoard();
    });
  }, [architectKey, refreshBoard]);

  return { architect, home, board, boardLoading, boardError, loadError, refreshBoard };
}
