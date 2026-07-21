import type { SessionEvent } from '@hiveryn/shared/domain';
import { type BrowserWindow, Notification } from 'electron';

// Native OS notifications for pending intents, so an approval request reaches
// the user even when no hiveryn window is focused. The notification is only an
// attention-getter + deep link: clicking it focuses the originating architect
// window and switches to the session tab that raised the intent, where the
// intent center card (the actual approve/deny surface) is already shown.

interface IntentNotificationDeps {
  // Focus the architect window for `architectKey` (creating it if needed) and
  // activate the given session's tab.
  focusSession: (architectKey: string, sessionId: string) => void;
  // The architect's window, if one is open — used to suppress a redundant toast
  // when the card is already on screen.
  getArchitectWindow: (architectKey: string) => BrowserWindow | undefined;
}

let deps: IntentNotificationDeps | null = null;

// One live toast per intent, keyed by intent id so the resolved event closes the
// exact notification.
const active = new Map<string, Notification>();

// Only a freshly-raised intent should raise a toast — never the durable-log
// backlog that replays on every SSE (re)connect. A replayed required event is
// either already resolved (would fire-and-immediately-close) or still pending
// and already toasted live (would double-fire). Live intents arrive with `at`
// ≈ now; the daemon runs on the same host, so the clocks match.
const FRESH_MS = 10_000;

export function configureIntentNotifications(d: IntentNotificationDeps): void {
  deps = d;
}

interface IntentOriginRaw {
  architectKey: string;
  sessionId: string;
  sessionType: string;
  ticketId?: string;
}

function readOrigin(raw: unknown): IntentOriginRaw | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.architect_key !== 'string' ||
    typeof o.session_id !== 'string' ||
    typeof o.session_type !== 'string'
  ) {
    return null;
  }
  return {
    architectKey: o.architect_key,
    sessionId: o.session_id,
    sessionType: o.session_type,
    ticketId: typeof o.ticket_id === 'string' ? o.ticket_id : undefined,
  };
}

function subtitleFor(origin: IntentOriginRaw): string {
  if (origin.sessionType === 'ticket') {
    return origin.ticketId ? `ticket ${origin.ticketId}` : 'ticket';
  }
  return origin.sessionType;
}

// Called for every session event the main process streams. Fires a toast on a
// fresh intent/required and closes it on the matching intent/resolved.
export function handleIntentEvent(event: SessionEvent): void {
  if (event.type !== 'intent') return;
  const intentId = event.raw?.intent_id;
  if (typeof intentId !== 'string' || !intentId) return;

  if (event.status === 'resolved') {
    const existing = active.get(intentId);
    if (existing) {
      existing.close();
      active.delete(intentId);
    }
    return;
  }
  if (event.status !== 'required') return;
  if (!deps) return;
  if (!Notification.isSupported()) {
    console.warn('[main:intent-notify] Notification unsupported — no OS toast', { intentId });
    return;
  }
  if (active.has(intentId)) return; // already toasted (backlog replay / second window)

  const at = Date.parse(event.at);
  if (Number.isFinite(at) && Date.now() - at > FRESH_MS) {
    console.log('[main:intent-notify] skip — stale (backlog replay)', {
      intentId,
      ageMs: Date.now() - at,
    });
    return;
  }

  const origin = readOrigin(event.raw?.origin);
  if (!origin) return;

  // If the architect's window is the focused window, the card is already on
  // screen — an OS toast would just be noise. Only notify when it isn't.
  const win = deps.getArchitectWindow(origin.architectKey);
  if (win && !win.isDestroyed() && win.isFocused()) {
    console.log('[main:intent-notify] skip — architect window focused (card visible)', {
      intentId,
      architectKey: origin.architectKey,
    });
    return;
  }

  const summary =
    typeof event.raw?.summary === 'string' && event.raw.summary
      ? event.raw.summary
      : 'An agent is requesting your approval';

  const notification = new Notification({
    title: origin.architectKey,
    subtitle: subtitleFor(origin),
    body: summary,
  });
  notification.on('click', () => deps?.focusSession(origin.architectKey, origin.sessionId));
  notification.on('close', () => {
    if (active.get(intentId) === notification) active.delete(intentId);
  });
  active.set(intentId, notification);
  console.log('[main:intent-notify] showing OS notification', {
    intentId,
    architectKey: origin.architectKey,
  });
  notification.show();
}
