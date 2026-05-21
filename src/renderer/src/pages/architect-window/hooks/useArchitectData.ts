import { useCallback, useEffect, useState } from 'react';
import type { Architect, SystemRuntime, TicketBoard } from '../../../../../shared/types';

const EMPTY_TICKET_BOARD: TicketBoard = { backlog: [], progress: [], done: [] };

export interface ArchitectData {
  architect: Architect | null;
  runtime: SystemRuntime | null;
  board: TicketBoard;
  boardLoading: boolean;
  boardError: unknown | null;
  loadError: unknown | null;
  refreshArchitect(): Promise<void>;
  refreshBoard(): Promise<void>;
}

export function useArchitectData(architectKey: string): ArchitectData {
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [runtime, setRuntime] = useState<SystemRuntime | null>(null);
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

      const [architectResult, runtimeResult, boardResult] = await Promise.allSettled([
        window.hiveryn.architects.get(architectKey),
        window.hiveryn.system.getRuntime(),
        window.hiveryn.tickets.list(architectKey),
      ]);

      if (cancelled) return;

      if (architectResult.status === 'fulfilled') {
        setArchitect(architectResult.value);
      } else {
        setLoadError(architectResult.reason);
      }

      if (runtimeResult.status === 'fulfilled') {
        setRuntime(runtimeResult.value);
      } else {
        setLoadError(runtimeResult.reason);
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
      if (event.type !== 'workspace_changed') return;
      void refreshArchitect();
      void refreshBoard();
    });
  }, [architectKey, refreshArchitect, refreshBoard]);

  return {
    architect,
    runtime,
    board,
    boardLoading,
    boardError,
    loadError,
    refreshArchitect,
    refreshBoard,
  };
}
