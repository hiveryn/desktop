import type { AgentProfile } from '@hiveryn/components';
import { ProfileSelector, Text, TicketDetail } from '@hiveryn/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ticket } from '../../../../../shared/types';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';
import styles from '../index.module.css';

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

interface Props {
  architectKey: string;
  selectedTicket: Ticket | null;
  onCloseTicket(): void;
  onBoardChanged(): void;
}

export default function TicketWorkflow({
  architectKey,
  selectedTicket,
  onCloseTicket,
  onBoardChanged,
}: Props) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [showProfileSelector, setShowProfileSelector] = useState(false);
  const [pendingTicket, setPendingTicket] = useState<Ticket | null>(null);
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
        onBoardChanged();
      } catch (err: unknown) {
        setSpawnError(err instanceof Error ? err.message : 'Worker spawn failed');
      }
    },
    [architectKey, onBoardChanged, onCloseTicket],
  );

  const handleProfileSelectorClose = useCallback(() => {
    setShowProfileSelector(false);
    setSpawnError(null);
  }, []);

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
        onSelect={(name) => void handleProfileSelect(name)}
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
