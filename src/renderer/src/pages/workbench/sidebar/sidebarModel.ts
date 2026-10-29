import type { ComponentType } from 'react';
import {
  Activity,
  AgentIdle,
  AgentInactive,
  AgentStopped,
  AgentWaiting,
  AlertTriangle,
  Disconnected,
  Terminal,
} from '../../../components/icons';
import type { PendingIntent, QuestionEntry } from '../../../state/sessionStore';

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
): StatusIndicator {
  if (machine && connection === 'disconnected') {
    return {
      icon: Disconnected,
      kind: 'disconnected',
      label: `Disconnected from ${machine} — the remote worker may still be running; activity is stale`,
    };
  }
  if (machine && connection === 'missing') {
    return {
      icon: AlertTriangle,
      kind: 'missing',
      label: `Remote worker on ${machine} is unavailable`,
    };
  }
  const indicator = agentStatusIndicator(status);
  return machine ? { ...indicator, label: `${indicator.label} · on ${machine}` } : indicator;
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
