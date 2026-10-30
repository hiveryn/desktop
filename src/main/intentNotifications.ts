import type { SessionEvent } from '@hiveryn/shared/domain';
import { type BrowserWindow, Notification } from 'electron';

// Native OS notifications for pending intents, so an approval request reaches
// the user when its approve/deny card is not on screen. The notification is only
// an attention-getter + deep link: clicking it brings the workbench window
// forward and selects the session that raised the intent, whose project's
// intent center shows the card.

interface IntentNotificationDeps {
  // Bring the workbench forward and select the given session.
  focusSession: (architectKey: string, sessionId: string) => void;
  // The workbench window, if open.
  getWindow: () => BrowserWindow | null;
}

// The project whose intent cards the workbench is showing, as reported by the
// renderer (null when no project is selected). The intent center renders only
// the selected project's intents, so a focused window alone does not mean the
// card is visible.
let visibleIntentArchitect: string | null = null;

export function setVisibleIntentArchitect(architectKey: string | null): void {
  visibleIntentArchitect = architectKey;
}

export interface IntentSurfaceState {
  windowFocused: boolean;
  windowVisible: boolean;
  visibleArchitectKey: string | null;
}

// Whether the approve/deny card for an intent of `architectKey` is already in
// front of the user, which makes an OS toast redundant.
export function isIntentSurfaceVisible(state: IntentSurfaceState, architectKey: string): boolean {
  return state.windowFocused && state.windowVisible && state.visibleArchitectKey === architectKey;
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
// fresh intent/required or companion action_request/required (requestAction —
// the daemon also alerts the phone) and closes it on the matching resolved
// event. Clicking selects the originating session, whose project's intent or
// action center shows the card.
export function handleIntentEvent(event: SessionEvent): void {
  if (event.type !== 'intent' && event.type !== 'action_request') return;
  const isAction = event.type === 'action_request';
  const rawId = isAction ? event.raw?.action_id : event.raw?.intent_id;
  if (typeof rawId !== 'string' || !rawId) return;
  // Intent and action ids come from different generators; keep them apart.
  const intentId = isAction ? `action:${rawId}` : rawId;

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
  if (active.has(intentId)) return; // already toasted (backlog replay / resubscribe)

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

  // The card is already on screen — an OS toast would just be noise.
  const win = deps.getWindow();
  const surface: IntentSurfaceState = {
    windowFocused: win !== null && !win.isDestroyed() && win.isFocused(),
    windowVisible: win !== null && !win.isDestroyed() && win.isVisible() && !win.isMinimized(),
    visibleArchitectKey: visibleIntentArchitect,
  };
  if (isIntentSurfaceVisible(surface, origin.architectKey)) {
    console.log('[main:intent-notify] skip — intent card visible in the workbench', {
      intentId,
      architectKey: origin.architectKey,
    });
    return;
  }

  const companion =
    typeof (event.raw?.origin as { companion?: unknown } | undefined)?.companion === 'string'
      ? (event.raw?.origin as { companion: string }).companion
      : undefined;
  const summary = isAction
    ? typeof event.raw?.title === 'string' && event.raw.title
      ? `Action request: ${event.raw.title}`
      : 'A companion is requesting your authorization'
    : typeof event.raw?.summary === 'string' && event.raw.summary
      ? event.raw.summary
      : 'An agent is requesting your approval';

  const notification = new Notification({
    title: origin.architectKey,
    subtitle: isAction ? `companion ${companion ?? ''}`.trim() : subtitleFor(origin),
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
