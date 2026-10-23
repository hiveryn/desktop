import type { AgentMessage } from '@hiveryn/shared/domain';

// Pure model for the architect window's delivery-status strip. It shows only
// what needs the user's attention: messages that are not progressing (open
// with a condition, or being redelivered) and recent failures. Delivered
// messages are not shown — appearing in the conversation is the normal case
// and the terminal already has them.

export type AgentMessageTone = 'waiting' | 'retrying' | 'failed';

export interface AgentMessageView {
  id: string;
  tone: AgentMessageTone;
  /** Short label: what the message announces. */
  label: string;
  /** Why it is not delivered (the daemon's condition or failure reason). */
  detail: string;
  attempts: number;
}

// Failures older than this are history, not something to act on.
const FAILED_VISIBLE_MS = 24 * 60 * 60 * 1000;

function label(message: AgentMessage): string {
  const ticket = message.payload?.ticket_id;
  if (message.kind === 'ticket_concluded' && typeof ticket === 'string') {
    return `Conclusion notice for ${ticket}`;
  }
  const action = message.payload?.action;
  const outcome = message.payload?.outcome;
  if (
    message.kind === 'action_ended' &&
    typeof action === 'string' &&
    typeof outcome === 'string'
  ) {
    return `Action ${action} ${outcome} notice for ${message.recipient}`;
  }
  if (message.kind === 'question_escalated' && typeof ticket === 'string') {
    return `Unanswered worker question on ${ticket} for the architect`;
  }
  return `${message.kind} to ${message.recipient}`;
}

export function agentMessageViews(messages: AgentMessage[], now: number): AgentMessageView[] {
  const views: AgentMessageView[] = [];
  for (const message of messages) {
    switch (message.state) {
      case 'pending_commit':
      case 'pending':
      case 'handed': {
        const detail = message.condition ?? '';
        if (detail === '') break;
        const retrying = message.attempts > 0 && message.state !== 'handed';
        views.push({
          id: message.id,
          tone: retrying ? 'retrying' : 'waiting',
          label: label(message),
          detail:
            message.last_error && retrying ? `${detail} (last: ${message.last_error})` : detail,
          attempts: message.attempts,
        });
        break;
      }
      case 'failed': {
        const ended = message.ended_at ? Date.parse(message.ended_at) : Number.NaN;
        if (!Number.isNaN(ended) && now - ended > FAILED_VISIBLE_MS) break;
        views.push({
          id: message.id,
          tone: 'failed',
          label: label(message),
          detail: message.last_error ?? 'delivery failed',
          attempts: message.attempts,
        });
        break;
      }
      default:
        break;
    }
  }
  return views;
}
