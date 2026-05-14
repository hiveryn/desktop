import type { AgentProfile } from '@hiveryn/components';
import { ProfileSelector, Text, TicketDetail } from '@hiveryn/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ticket, TicketSummary } from '../../../../../shared/types';
import { matchesShortcut, type ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';
import styles from '../index.module.css';

// The spawn flow only needs id + title from a ticket.
type SpawnableTicket = Pick<TicketSummary, 'id' | 'title'>;

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

interface Props {
  architectKey: string;
  selectedTicket: Ticket | null;
  // When set, opens the profile selector directly with this ticket (skipping
  // the ticket detail dialog). Used by the kanban `s` shortcut.
  spawnRequest: SpawnableTicket | null;
  shortcutConfig: ShortcutConfig | null;
  onCloseTicket(): void;
  onSpawnRequestClear(): void;
  onBoardChanged(): void;
}

export default function TicketWorkflow({
  architectKey,
  selectedTicket,
  spawnRequest,
  shortcutConfig,
  onCloseTicket,
  onSpawnRequestClear,
  onBoardChanged,
}: Props) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [showProfileSelector, setShowProfileSelector] = useState(false);
  const [pendingTicket, setPendingTicket] = useState<SpawnableTicket | null>(null);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const pendingTicketRef = useRef(pendingTicket);
  pendingTicketRef.current = pendingTicket;

  useEffect(() => {
    let cancelled = false;
    window.hiveryn.profiles
      .list()
      .then((list) => {
        if (!cancelled) setProfiles(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSpawn = useCallback(() => {
    if (!selectedTicket) return;
    setPendingTicket(selectedTicket);
    setShowProfileSelector(true);
    setSpawnError(null);
  }, [selectedTicket]);

  const handleProfileSelect = useCallback(
    async (profileName: string) => {
      const ticket = pendingTicketRef.current;
      if (!architectKey || !ticket) return;
      setShowProfileSelector(false);
      setSpawnError(null);
      try {
        const result = await window.hiveryn.architects.spawnWorker(
          architectKey,
          ticket.id,
          profileName,
          100,
          30,
        );

        const record: SessionRecord = {
          id: result.session_id,
          type: 'work',
          label: truncate(ticket.title, 30),
          ticketId: ticket.id,
          mainTerminalId: result.main_terminal_id,
          tabs: [],
        };

        try {
          record.tabs = await window.hiveryn.tabs.list(result.session_id);
        } catch {
          // Non-fatal — extras will appear on next restore.
        }

        const store = useSessionStore.getState();
        store.registerSession(record);
        store.setActiveSession(result.session_id);
        store.setActiveRightTab('event-log');

        setPendingTicket(null);
        onCloseTicket();
        onSpawnRequestClear();
        onBoardChanged();
      } catch (err: unknown) {
        setSpawnError(err instanceof Error ? err.message : 'Worker spawn failed');
      }
    },
    [architectKey, onBoardChanged, onCloseTicket, onSpawnRequestClear],
  );

  const handleProfileSelectorClose = useCallback(() => {
    setShowProfileSelector(false);
    setSpawnError(null);
    onSpawnRequestClear();
  }, [onSpawnRequestClear]);

  // When the kanban `s` shortcut fires, jump straight to the profile selector.
  useEffect(() => {
    if (!spawnRequest) return;
    setPendingTicket(spawnRequest);
    setShowProfileSelector(true);
    setSpawnError(null);
  }, [spawnRequest]);

  // Global `quit` shortcut (default: q) — dismisses the open dialog. Only
  // listens while a dialog is actually open so 'q' keystrokes elsewhere
  // (terminals, kanban, etc.) are not swallowed.
  const dialogOpen = selectedTicket !== null || showProfileSelector;
  useEffect(() => {
    if (!dialogOpen) return;
    const binding = shortcutConfig?.global?.quit;
    if (!binding) return;

    function handler(e: KeyboardEvent): void {
      if (!matchesShortcut(e, binding ?? '')) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (showProfileSelector) {
        handleProfileSelectorClose();
      } else if (selectedTicket) {
        onCloseTicket();
      }
    }

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [
    dialogOpen,
    shortcutConfig,
    showProfileSelector,
    selectedTicket,
    onCloseTicket,
    handleProfileSelectorClose,
  ]);

  return (
    <>
      {selectedTicket ? (
        <TicketDetail
          ticket={selectedTicket}
          open
          onClose={onCloseTicket}
          onSpawn={selectedTicket.status === 'backlog' ? handleSpawn : undefined}
        />
      ) : null}

      <ProfileSelector
        profiles={profiles}
        open={showProfileSelector}
        onSelect={(name: string) => void handleProfileSelect(name)}
        onClose={handleProfileSelectorClose}
      />

      {spawnError ? (
        <Text
          className={styles.error}
          style={{ position: 'fixed', bottom: 48, left: 16, zIndex: 100 }}
        >
          {spawnError}
        </Text>
      ) : null}
    </>
  );
}
