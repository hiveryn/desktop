import type { Companion } from '@hiveryn/shared/domain';
import type { ComponentType } from 'react';
import {
  Activity,
  AgentIdle,
  AgentInactive,
  AgentStopped,
  AgentWaiting,
  AlertTriangle,
  Disconnected,
  Ellipsis,
  Terminal,
} from '../../../components/icons';
import type { ActionEntry, PendingIntent, QuestionEntry } from '../../../state/sessionStore';

// What a sidebar row's status icon shows: the glyph plus the words it replaces,
// used as the accessible label and the hover description.
export interface StatusIndicator {
  icon: ComponentType;
  // Stable token for styling and tests (data-status).
  kind: string;
  label: string;
}

// The live agent status (daemon SessionRun.AgentStatus). The same glyphs as the
// former bottom tabs.
export function agentStatusIndicator(status: string | undefined): StatusIndicator {
  switch (status) {
    case 'active':
      return { icon: Activity, kind: 'active', label: 'Working' };
    case 'idle':
      return { icon: AgentIdle, kind: 'idle', label: 'Idle — ready for input' };
    case 'waiting':
      return { icon: AgentWaiting, kind: 'waiting', label: 'Waiting for your response' };
    case 'stopped':
      return { icon: AgentStopped, kind: 'stopped', label: 'Stopped' };
    default:
      return { icon: Terminal, kind: 'unknown', label: 'Status not reported yet' };
  }
}

const INACTIVE: StatusIndicator = {
  icon: AgentInactive,
  kind: 'inactive',
  label: 'No architect session running — select to launch one',
};

// An architect row: its architect session's status, or inactive when none runs
// (its workers, if any, are listed beneath it).
export function architectIndicator(
  sessionRunning: boolean,
  status: string | null,
): StatusIndicator {
  if (!sessionRunning) return INACTIVE;
  return agentStatusIndicator(status ?? undefined);
}

// A worker row. A remote worker whose connection is down shows that instead of
// its (stale) agent status.
export function workerIndicator(
  status: string | undefined,
  machine: string | undefined,
  connection: string | undefined,
  role = 'worker',
): StatusIndicator {
  if (machine && connection === 'disconnected') {
    return {
      icon: Disconnected,
      kind: 'disconnected',
      label: `Disconnected from ${machine} — the remote ${role} may still be running; activity is stale`,
    };
  }
  if (machine && connection === 'missing') {
    return {
      icon: AlertTriangle,
      kind: 'missing',
      label: `Remote ${role} on ${machine} is unavailable`,
    };
  }
  const indicator = agentStatusIndicator(status);
  return machine ? { ...indicator, label: `${indicator.label} · on ${machine}` } : indicator;
}

function withError(label: string, error: string | undefined): string {
  return error ? `${label}: ${error}` : label;
}

// A companion row: its lifecycle first (the daemon's companion status), the
// live agent status and remote connection only while it runs. `live` carries
// the open project's session-stream values, which are newer than the listing.
export function companionIndicator(
  companion: Companion,
  live?: { status?: string; connection?: string },
): StatusIndicator {
  const on = companion.machine ? ` · on ${companion.machine}` : '';
  switch (companion.status) {
    case 'running':
      return workerIndicator(
        live?.status ?? companion.agent_status,
        companion.machine,
        live?.connection ?? companion.connection,
        'companion',
      );
    case 'starting':
      return { icon: Ellipsis, kind: 'starting', label: `Starting${on}` };
    case 'shutdown_requested':
      return {
        icon: Ellipsis,
        kind: 'shutting-down',
        label: `Shutdown requested — preparing its handoff${on}`,
      };
    case 'stopping':
      return {
        icon: Ellipsis,
        kind: 'stopping',
        label: `Stopping — handoff recorded, confirming termination${on}`,
      };
    case 'stopped':
      return { icon: AgentStopped, kind: 'stopped', label: 'Stopped — termination confirmed' };
    case 'stop_failed':
      return {
        icon: AlertTriangle,
        kind: 'stop-failed',
        label: withError(
          `Termination not confirmed${on} — it may still be running and blocks the architect's conclusion`,
          companion.error,
        ),
      };
    case 'start_failed':
      return {
        icon: AlertTriangle,
        kind: 'start-failed',
        label: withError('Failed to start', companion.error),
      };
    case 'failed':
      return {
        icon: AlertTriangle,
        kind: 'failed',
        label: withError('Process ended and could not be resumed', companion.error),
      };
  }
}

// A companion whose termination the user may retry (stop_failed) or whose
// ended process the user may clear (failed) — the daemon's only recovery
// route; a running companion ends through its architect's shutdown request.
export function companionRecovery(companion: Companion): 'retry-termination' | 'remove' | null {
  if (!companion.session_id) return null;
  if (companion.status === 'stop_failed') return 'retry-termination';
  if (companion.status === 'failed') return 'remove';
  return null;
}

// Whether a session has a pending intent or question the user is not looking
// at. The shown session's cards are already on screen.
export function needsAttention(
  sessionId: string,
  activeSessionId: string | null,
  pendingIntents: Record<string, PendingIntent>,
  questions: Record<string, QuestionEntry>,
): boolean {
  if (sessionId === activeSessionId) return false;
  return (
    Object.values(pendingIntents).some((intent) => intent.origin.session_id === sessionId) ||
    Object.values(questions).some(
      (question) => question.status === 'pending' && question.origin.session_id === sessionId,
    )
  );
}

// Whether a companion has an undecided action request. Unlike questions this
// shows even on the shown session: the decision dialog is project-wide and the
// request authorizes nothing until decided. Open projects use the session
// stream (`actions`), others the polled listing's pending_actions.
export function companionNeedsDecision(
  companion: Companion,
  actions: Record<string, ActionEntry>,
  sessionKnown: boolean,
): boolean {
  if (!companion.session_id) return false;
  if (sessionKnown) {
    return Object.values(actions).some(
      (a) => a.status === 'pending' && a.origin.session_id === companion.session_id,
    );
  }
  return companion.pending_actions.length > 0;
}
