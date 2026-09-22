import type { AgentProfile } from '@components';
import { TicketDetail } from '@components';
import type { Ticket, TicketReference, TicketSummary } from '@hiveryn/shared/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../../keys/dispatcher';
import { matchesShortcut } from '../../../keys/matchers';
import { useSessionStore } from '../../../state/sessionStore';
import { loadSessionRecord } from '../hooks/sessionSnapshot';
import { findRelaunchableSession } from './TicketLaunchDialog/launchSelection';
import TicketLaunchDialog, { type LaunchableTicket } from './TicketLaunchDialog/TicketLaunchDialog';

interface Props {
  architectKey: string;
  selectedTicket: Ticket | null;
  // When set, opens the launch dialog directly with this ticket (skipping the
  // ticket detail dialog). Used by the kanban `s` shortcut — the same dialog as
  // the ticket-detail Spawn, so both paths launch the same way.
  spawnRequest: TicketSummary | null;
  shortcutConfig: ShortcutConfig | null;
  onCloseTicket(): void;
  onSpawnRequestClear(): void;
  onBoardChanged(): void;
  onTicketReference(id: string): void;
}

// A session created for this ticket that never reached a running run. Used to
// relaunch instead of creating a second one.
interface AdoptedSession {
  id: string;
  workflows: string[];
}

export default function TicketWorkflow({
  architectKey,
  selectedTicket,
  spawnRequest,
  shortcutConfig,
  onCloseTicket,
  onSpawnRequestClear,
  onBoardChanged,
  onTicketReference,
}: Props) {
  const handleReference = (reference: TicketReference): void => {
    if (!reference.exists) return;
    if (reference.type === 'ticket') onTicketReference(reference.value);
    else void window.hiveryn.fs.revealInFinder(reference.value);
  };
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [launchTicket, setLaunchTicket] = useState<LaunchableTicket | null>(null);
  // Resolved before the dialog mounts so the dialog's selection is right from
  // its first render; `undefined` means "still looking".
  const [adopted, setAdopted] = useState<AdoptedSession | null | undefined>(undefined);
  // Within one dialog, the session created by a failed attempt. A retry
  // launches that session instead of creating another one for the same ticket.
  const createdSession = useRef<AdoptedSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.hiveryn.profiles.list().then((list) => {
      if (!cancelled) setProfiles(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openLaunchDialog = useCallback((ticket: LaunchableTicket) => {
    createdSession.current = null;
    setAdopted(undefined);
    setLaunchTicket(ticket);
  }, []);

  // Look for a session this ticket already owns but never launched — what a
  // previous attempt that failed after session creation leaves behind. It has
  // no run, so nothing else in the window would ever show it again.
  useEffect(() => {
    if (launchTicket === null) return;
    let cancelled = false;
    void window.hiveryn.sessions.list().then((sessions) => {
      if (cancelled) return;
      const existing = findRelaunchableSession(sessions, architectKey, launchTicket.id);
      const session = existing === null ? null : { id: existing.id, workflows: existing.workflows };
      createdSession.current = session;
      setAdopted(session);
    });
    return () => {
      cancelled = true;
    };
  }, [architectKey, launchTicket]);

  const handleSpawn = useCallback(() => {
    if (!selectedTicket) return;
    openLaunchDialog(selectedTicket);
  }, [openLaunchDialog, selectedTicket]);

  const closeLaunchDialog = useCallback(() => {
    setLaunchTicket(null);
    setAdopted(undefined);
    createdSession.current = null;
    onSpawnRequestClear();
  }, [onSpawnRequestClear]);

  // The only place a session is created or launched. Everything before Spawn —
  // opening the dialog, picking a profile, ticking workflows — creates nothing.
  const handleLaunch = useCallback(
    async (profileName: string, workflows: string[]): Promise<void> => {
      const ticket = launchTicket;
      if (!architectKey || !ticket) {
        throw new Error('launch requested without an architect key and ticket');
      }

      let session = createdSession.current;
      if (session === null) {
        const created = await window.hiveryn.sessions.create(
          'ticket',
          architectKey,
          ticket.id,
          workflows,
        );
        session = { id: created.id, workflows: created.workflows };
        // Recorded before the run is started: a run failure must not make the
        // next attempt create a second session for this ticket.
        createdSession.current = session;
        setAdopted(session);
      }

      await window.hiveryn.sessions.createRun(session.id, profileName, 100, 30);

      const record = await loadSessionRecord(session.id);
      if (!record) {
        throw new Error(`Spawned session ${session.id} is missing from sessions.list()`);
      }

      const store = useSessionStore.getState();
      store.registerSession(record);
      store.setActiveSession(session.id);

      setLaunchTicket(null);
      setAdopted(undefined);
      createdSession.current = null;
      onCloseTicket();
      onSpawnRequestClear();
      onBoardChanged();
    },
    [architectKey, launchTicket, onBoardChanged, onCloseTicket, onSpawnRequestClear],
  );

  // When the kanban `s` shortcut fires, open the same launch dialog.
  useEffect(() => {
    if (!spawnRequest) return;
    openLaunchDialog(spawnRequest);
  }, [openLaunchDialog, spawnRequest]);

  // Global `quit` shortcut (default: q) — dismisses the open dialog. Only
  // registered while a dialog is actually open so 'q' keystrokes elsewhere
  // (terminals, kanban, etc.) are not swallowed. The launch dialog owns a text
  // input, so it is deliberately not dismissed this way.
  const dialogOpen = selectedTicket !== null;
  useEffect(() => {
    if (!dialogOpen || launchTicket !== null) return;
    const binding = shortcutConfig?.global?.quit;
    if (!binding) return;
    return registerDynamicHandler((e) => {
      if (!matchesShortcut(e, binding)) return 'passthrough';
      onCloseTicket();
      return 'consumed';
    });
  }, [dialogOpen, launchTicket, shortcutConfig, onCloseTicket]);

  return (
    <>
      {selectedTicket ? (
        <TicketDetail
          architectKey={architectKey}
          ticket={selectedTicket}
          open
          onClose={onCloseTicket}
          onSpawn={selectedTicket.status === 'backlog' ? handleSpawn : undefined}
          onReference={handleReference}
        />
      ) : null}

      {launchTicket !== null && adopted !== undefined ? (
        <TicketLaunchDialog
          // Remount per ticket: suggestions are recomputed for every launch, so
          // one ticket's selection can never survive into another's dialog.
          key={launchTicket.id}
          architectKey={architectKey}
          ticket={launchTicket}
          profiles={profiles}
          existingSession={adopted}
          onLaunch={handleLaunch}
          onCancel={closeLaunchDialog}
        />
      ) : null}
    </>
  );
}
