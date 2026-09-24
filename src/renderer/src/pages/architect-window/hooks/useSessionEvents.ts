import type { Intent, IntentOrigin } from '@hiveryn/shared/domain';
import { useEffect, useRef } from 'react';
import {
  parseIntentInputIssues,
  parseIntentInputs,
} from '../../../components/IntentCenter/intentInputsModel';
import { useSessionStore } from '../../../state/sessionStore';

function parseIntentOrigin(rawOrigin: unknown): IntentOrigin {
  if (!rawOrigin || typeof rawOrigin !== 'object') {
    throw new Error(`intent event missing raw.origin: ${JSON.stringify(rawOrigin)}`);
  }
  const o = rawOrigin as Record<string, unknown>;
  if (
    typeof o.architect_key !== 'string' ||
    typeof o.session_id !== 'string' ||
    typeof o.session_type !== 'string'
  ) {
    throw new Error(`intent event has malformed raw.origin: ${JSON.stringify(o)}`);
  }
  return {
    architect_key: o.architect_key,
    session_id: o.session_id,
    session_type: o.session_type as IntentOrigin['session_type'],
    ticket_id: typeof o.ticket_id === 'string' ? o.ticket_id : undefined,
  };
}

// Rebuild the generic Intent the popup renders from an intent/required event's
// raw payload. Tool-agnostic: no field is conclude- or ticket-specific, so any
// future tool routed through the daemon intent system renders with no change.
function parseIntentRequired(event: { raw?: Record<string, unknown>; at: string }): Intent {
  const raw = event.raw ?? {};
  const intentId = raw.intent_id;
  if (typeof intentId !== 'string' || !intentId) {
    throw new Error(`intent/required event missing raw.intent_id: ${JSON.stringify(event)}`);
  }
  const intentType = raw.intent_type;
  if (intentType !== 'concludeSession' && intentType !== 'createWorkTicket') {
    throw new Error(`intent/required event has unknown raw.intent_type: ${JSON.stringify(event)}`);
  }
  const waitSeconds = raw.wait_seconds;
  if (typeof waitSeconds !== 'number') {
    throw new Error(
      `intent/required event missing numeric raw.wait_seconds: ${JSON.stringify(event)}`,
    );
  }
  const policy = raw.policy;
  if (policy !== 'auto-allow' && policy !== 'wait-then-allow' && policy !== 'wait-then-deny') {
    throw new Error(`intent/required event has unknown raw.policy: ${JSON.stringify(event)}`);
  }
  const payload =
    raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
      ? (raw.payload as Record<string, unknown>)
      : undefined;
  return {
    intent_id: intentId,
    intent_type: intentType,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    payload,
    inputs: parseIntentInputs(raw.inputs),
    unresolved_inputs: parseIntentInputIssues(raw.unresolved_inputs),
    origin: parseIntentOrigin(raw.origin),
    wait_seconds: waitSeconds,
    policy,
    created_at: event.at,
  };
}

interface MainTerminalResumeEvent {
  mainTerminalId: string;
  previousTerminalId: string;
}

function mainTerminalResumeEvent(event: {
  raw?: Record<string, unknown>;
}): MainTerminalResumeEvent {
  const mainTerminalID = event.raw?.main_terminal_id;
  if (typeof mainTerminalID !== 'string' || mainTerminalID.trim() === '') {
    throw new Error(`main_terminal_resumed missing main_terminal_id: ${JSON.stringify(event.raw)}`);
  }

  const previousTerminalID = event.raw?.previous_terminal_id;
  if (typeof previousTerminalID !== 'string' || previousTerminalID.trim() === '') {
    throw new Error(
      `main_terminal_resumed missing previous_terminal_id: ${JSON.stringify(event.raw)}`,
    );
  }

  return { mainTerminalId: mainTerminalID, previousTerminalId: previousTerminalID };
}

// A session end that should tear down the tab: either concluded (normal) or
// discarded (ticket session moved back to backlog as if never spawned).
function isFinalSessionEnd(event: { raw?: Record<string, unknown> }): boolean {
  const lifecycle = event.raw?.lifecycle;
  return lifecycle === 'concluded' || lifecycle === 'discarded';
}

async function cleanupEndedSession(
  sessionId: string,
  sessionType: 'architect' | 'ticket',
): Promise<void> {
  await window.hiveryn.session.disconnect(sessionId);

  const store = useSessionStore.getState();
  const architectId =
    Object.values(store.sessions).find(
      (session) => session.type === 'architect' && session.id !== sessionId,
    )?.id ?? null;

  store.unregisterSession(sessionId);

  if (sessionType === 'architect') {
    await window.hiveryn.architect.closeWindow();
    return;
  }

  store.setActiveSession(architectId);
  store.setFocusedPane(architectId ? 'main-terminal' : 'right-event-log');
}

export function useSessionEvents(): void {
  const endingSessionIdsRef = useRef(new Set<string>());

  useEffect(() => {
    return window.hiveryn.session.onEvent((event) => {
      const store = useSessionStore.getState();
      store.appendEvent(event);

      if (event.type === 'main_terminal_resumed') {
        const session = store.sessions[event.session_id];
        if (!session) {
          throw new Error(`main_terminal_resumed received for missing session ${event.session_id}`);
        }
        const resume = mainTerminalResumeEvent(event);
        if (session.mainTerminalId === resume.mainTerminalId) return;
        if (session.mainTerminalId !== resume.previousTerminalId) return;
        store.updateSessionMainTerminal(event.session_id, resume.mainTerminalId);
        return;
      }

      // Live agent status drives the bottom-tab icon. Backlog replays in order,
      // so the last agent_status event wins on reconnect.
      if (event.type === 'agent_status') {
        if (!event.status) {
          throw new Error(`agent_status event missing status: ${JSON.stringify(event)}`);
        }
        store.setSessionStatus(event.session_id, event.status);
        return;
      }

      // A pending agent intent (conclude, create-ticket, …). Rendered by the
      // window-level intent center, keyed by intent id, across all sessions.
      if (event.type === 'intent' && event.status === 'required') {
        store.setPendingIntent(parseIntentRequired(event));
        return;
      }

      // Durable counterpart to intent/required: clears the card when the intent
      // resolves (approved/denied/auto/error/daemon-restart). The SSE backlog
      // replays in order, so a resolved event following a required event nets to
      // "no card" on reconnect. Pairing is by intent id, never session id.
      if (event.type === 'intent' && event.status === 'resolved') {
        const intentId = event.raw?.intent_id;
        if (typeof intentId === 'string' && intentId) {
          store.clearPendingIntent(intentId);
        }
        return;
      }

      if (event.type !== 'status' || event.status !== 'ended' || !isFinalSessionEnd(event)) {
        return;
      }
      if (endingSessionIdsRef.current.has(event.session_id)) return;

      const session = store.sessions[event.session_id];
      if (!session) return;

      endingSessionIdsRef.current.add(event.session_id);
      void cleanupEndedSession(event.session_id, session.type);
    });
  }, []);
}
