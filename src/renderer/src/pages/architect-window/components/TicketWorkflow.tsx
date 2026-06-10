import type { AgentProfile } from '@components';
import { ApiEnvelopeError, ProfileSelector, TicketDetail } from '@components';
import type { Ticket, TicketSummary } from '@hiveryn/shared/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../../keys/dispatcher';
import { matchesShortcut } from '../../../keys/matchers';
import { useSessionStore } from '../../../state/sessionStore';
import { loadSessionRecord } from '../hooks/sessionSnapshot';
import styles from '../index.module.css';

// The spawn flow only needs id + title from a ticket.
type SpawnableTicket = Pick<TicketSummary, 'id' | 'title'>;

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
  const [spawnError, setSpawnError] = useState<unknown | null>(null);
  const pendingTicketRef = useRef(pendingTicket);
  pendingTicketRef.current = pendingTicket;

  useEffect(() => {
    let cancelled = false;
    void window.hiveryn.profiles.list().then((list) => {
      if (!cancelled) setProfiles(list);
    });
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
        const intent = await window.hiveryn.sessions.create('ticket', architectKey, ticket.id);
        await window.hiveryn.sessions.createRun(intent.id, profileName, 100, 30);

        const record = await loadSessionRecord(intent.id);
        if (!record) {
          throw new Error(`Spawned session ${intent.id} is missing from sessions.list()`);
        }

        const store = useSessionStore.getState();
        store.registerSession(record);
        store.setActiveSession(intent.id);

        setPendingTicket(null);
        onCloseTicket();
        onSpawnRequestClear();
        onBoardChanged();
      } catch (err: unknown) {
        setSpawnError(err);
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
  // registered while a dialog is actually open so 'q' keystrokes elsewhere
  // (terminals, kanban, etc.) are not swallowed.
  const dialogOpen = selectedTicket !== null || showProfileSelector;
  useEffect(() => {
    if (!dialogOpen) return;
    const binding = shortcutConfig?.global?.quit;
    if (!binding) return;
    return registerDynamicHandler((e) => {
      if (!matchesShortcut(e, binding)) return 'passthrough';
      if (showProfileSelector) {
        handleProfileSelectorClose();
      } else if (selectedTicket) {
        onCloseTicket();
      }
      return 'consumed';
    });
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
        <ApiEnvelopeError
          error={spawnError}
          title="Worker Spawn API Error"
          className={styles.error}
          style={{ position: 'fixed', bottom: 48, left: 16, zIndex: 100 }}
        />
      ) : null}
    </>
  );
}
