import type { TicketBoard } from '@hiveryn/shared/domain';
import { ARCHITECT_EVENT_TYPE } from '@hiveryn/shared/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Architect, STREAM_CONNECTED_EVENT_TYPE } from '../../../../../shared/types';

const EMPTY_TICKET_BOARD: TicketBoard = { backlog: [], progress: [], done: [] };

export interface ArchitectData {
  architect: Architect | null;
  // The user's OS home dir — used for ~-shortening paths in the nav.
  userHome: string | null;
  // The last board that loaded successfully; kept through failed refreshes.
  board: TicketBoard;
  // A board has loaded for this architect; until then `board` is empty, not
  // known to be empty.
  boardLoaded: boolean;
  // A listing request is in flight.
  boardLoading: boolean;
  // Why the latest listing failed, or null when it succeeded.
  boardError: unknown | null;
  loadError: unknown | null;
  refreshArchitect(): Promise<void>;
  refreshBoard(): Promise<void>;
  retryLoad(): Promise<void>;
}

export function useArchitectData(architectKey: string): ArchitectData {
  const [architect, setArchitect] = useState<Architect | null>(null);
  const [userHome, setUserHome] = useState<string | null>(null);
  const [board, setBoard] = useState<TicketBoard>(EMPTY_TICKET_BOARD);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<unknown | null>(null);
  const [loadError, setLoadError] = useState<unknown | null>(null);

  const refreshArchitect = useCallback(async () => {
    if (!architectKey) return;
    const next = await window.hiveryn.architects.get(architectKey);
    setArchitect(next);
  }, [architectKey]);

  // Every listing takes a token. A board is applied unless a newer one already
  // was, and a failure only when it is the newest request, so a request
  // finishing late can neither replace a newer board nor report a failure a
  // newer request has already recovered from.
  const boardTokenRef = useRef(0);
  const appliedBoardTokenRef = useRef(0);
  const boardKeyRef = useRef(architectKey);

  const listBoard = useCallback(async (): Promise<void> => {
    const token = ++boardTokenRef.current;
    setBoardLoading(true);
    try {
      const next = await window.hiveryn.tickets.list(architectKey);
      if (appliedBoardTokenRef.current > token) return;
      appliedBoardTokenRef.current = token;
      setBoard(next);
      setBoardLoaded(true);
      if (boardTokenRef.current === token) setBoardError(null);
    } catch (error: unknown) {
      if (boardTokenRef.current !== token) return;
      // Keep the last successful board; the error explains why it is stale.
      setBoardError(error);
    } finally {
      if (boardTokenRef.current === token) setBoardLoading(false);
    }
  }, [architectKey]);

  const refreshBoard = useCallback(async () => {
    if (!architectKey) return;
    await listBoard();
  }, [architectKey, listBoard]);

  // Tokened so a stale in-flight load (from a superseded architectKey, or an
  // earlier retryLoad() call) can't clobber state after a newer one starts.
  const loadTokenRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const token = ++loadTokenRef.current;

    if (boardKeyRef.current !== architectKey) {
      boardKeyRef.current = architectKey;
      appliedBoardTokenRef.current = boardTokenRef.current;
      setBoard(EMPTY_TICKET_BOARD);
      setBoardLoaded(false);
    }

    if (!architectKey) {
      setLoadError('Missing architect key');
      setBoardLoading(false);
      return;
    }

    setLoadError(null);

    const [architectResult, userHomeResult] = await Promise.allSettled([
      window.hiveryn.architects.get(architectKey),
      window.hiveryn.system.getUserHome(),
      listBoard(),
    ]);

    if (loadTokenRef.current !== token) return;

    if (architectResult.status === 'fulfilled') {
      setArchitect(architectResult.value);
    } else {
      setLoadError(architectResult.reason);
    }

    if (userHomeResult.status === 'fulfilled') {
      setUserHome(userHomeResult.value);
    }
  }, [architectKey, listBoard]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!architectKey) return;
    return window.hiveryn.architects.subscribeEvents(architectKey, (event) => {
      // A real daemon change, or a (re)connect signal telling us to reconcile —
      // both warrant a full refetch so a missed event can't leave us stale.
      if (event.type !== ARCHITECT_EVENT_TYPE && event.type !== STREAM_CONNECTED_EVENT_TYPE) {
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
    boardLoaded,
    boardLoading,
    boardError,
    loadError,
    refreshArchitect,
    refreshBoard,
    retryLoad: load,
  };
}
