import type { CreateTerminalParams, TerminalWorkdir } from '@hiveryn/shared/domain';
import { create } from 'zustand';
import { useSessionStore } from '../../state/sessionStore';

export interface TerminalCreationRequest {
  sessionId: string;
  capturedActiveRightTab: string;
  capturedFocusedPane: string;
}

/** A terminal creation in flight: one per session, shown until it settles. */
export interface PendingTerminal {
  title: string;
  /** The machine the terminal opens on; absent for a local terminal. */
  machine?: string;
  startedAt: number;
}

interface PendingTerminalState {
  bySession: Record<string, PendingTerminal>;
}

// Window-local view state: which sessions have a terminal being opened. The
// daemon refuses a second concurrent creation per session too; this keeps the
// UI from offering one.
export const usePendingTerminalStore = create<PendingTerminalState>(() => ({ bySession: {} }));

function setPending(sessionId: string, pending: PendingTerminal | null): void {
  usePendingTerminalStore.setState(({ bySession }) => {
    const next = { ...bySession };
    if (pending) next[sessionId] = pending;
    else delete next[sessionId];
    return { bySession: next };
  });
}

export function isTerminalPending(sessionId: string): boolean {
  return sessionId in usePendingTerminalStore.getState().bySession;
}

export const TERMINAL_WORKDIR_REQUEST = 'hiveryn:terminal-workdir-request';
export function requestTerminalCreation(request: TerminalCreationRequest): void {
  // One terminal is opened at a time per session; a repeated "+" while it is
  // pending would only queue a duplicate.
  if (isTerminalPending(request.sessionId)) return;
  window.dispatchEvent(
    new CustomEvent<TerminalCreationRequest>(TERMINAL_WORKDIR_REQUEST, { detail: request }),
  );
}
export async function createSelectedTerminal(
  request: TerminalCreationRequest,
  choice: TerminalWorkdir,
): Promise<void> {
  const before = getState();
  if (
    before.activeSessionId !== request.sessionId ||
    before.activeRightTab !== request.capturedActiveRightTab ||
    before.focusedPane !== request.capturedFocusedPane ||
    isTerminalPending(request.sessionId)
  )
    return;
  const body: CreateTerminalParams = { workdir_id: choice.id };
  setPending(request.sessionId, {
    title: choice.title,
    machine: choice.machine || undefined,
    startedAt: Date.now(),
  });
  let created: Awaited<ReturnType<typeof window.hiveryn.terminals.create>>;
  try {
    created = await window.hiveryn.terminals.create(request.sessionId, body);
  } catch (err) {
    // The failure itself reaches the error center through the request log. A
    // timed-out request may still have produced a terminal, so show the
    // daemon's current tabs rather than assume none.
    await refreshTabs(request.sessionId);
    console.warn('[terminal] create failed', request.sessionId, choice.id, err);
    return;
  } finally {
    setPending(request.sessionId, null);
  }
  await refreshTabs(request.sessionId);
  const after = getState();
  if (after.activeSessionId !== request.sessionId) return;
  after.setActiveRightTab(created.terminal_id);
  after.setFocusedPane(`right-terminal:${created.terminal_id}`);
}

async function refreshTabs(sessionId: string): Promise<void> {
  try {
    const tabs = await window.hiveryn.tabs.list(sessionId);
    getState().setSessionTabs(sessionId, tabs);
  } catch (err) {
    console.warn('[terminal] tabs refresh failed', sessionId, err);
  }
}

function getState() {
  return useSessionStore.getState();
}
