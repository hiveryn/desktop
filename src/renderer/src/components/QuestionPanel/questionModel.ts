import type { AgentQuestion, QuestionOrigin, QuestionStatus } from '@hiveryn/shared/domain';
import type { QuestionResolution } from '../../state/sessionStore';

// Pure model for agent questions: parsing the daemon's session events and the
// answer form's rules. The daemon authors these events (sessionruntime
// questions.go), so a malformed one is a bug and throws.

interface QuestionEvent {
  raw?: Record<string, unknown>;
  at: string;
}

const STATUSES: readonly QuestionStatus[] = [
  'pending',
  'answered',
  'expired',
  'cancelled',
  'interrupted',
];

function requireString(raw: Record<string, unknown>, field: string, event: QuestionEvent): string {
  const value = raw[field];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`question event missing raw.${field}: ${JSON.stringify(event)}`);
  }
  return value;
}

function parseOrigin(value: unknown, event: QuestionEvent): QuestionOrigin {
  if (!value || typeof value !== 'object') {
    throw new Error(`question event missing raw.origin: ${JSON.stringify(event)}`);
  }
  const o = value as Record<string, unknown>;
  if (
    typeof o.architect_key !== 'string' ||
    typeof o.session_id !== 'string' ||
    typeof o.session_type !== 'string'
  ) {
    throw new Error(`question event has malformed raw.origin: ${JSON.stringify(event)}`);
  }
  return {
    architect_key: o.architect_key,
    session_id: o.session_id,
    session_type: o.session_type as QuestionOrigin['session_type'],
    ticket_id: typeof o.ticket_id === 'string' ? o.ticket_id : undefined,
    action: typeof o.action === 'string' ? o.action : undefined,
    execution_id: typeof o.execution_id === 'string' ? o.execution_id : undefined,
  };
}

export function parseQuestionRequired(event: QuestionEvent): AgentQuestion {
  const raw = event.raw ?? {};
  const answers = raw.answers;
  if (
    !Array.isArray(answers) ||
    answers.length === 0 ||
    !answers.every((a) => typeof a === 'string')
  ) {
    throw new Error(`question event has malformed raw.answers: ${JSON.stringify(event)}`);
  }
  const recommended = raw.recommended_index;
  if (
    typeof recommended !== 'number' ||
    !Number.isInteger(recommended) ||
    recommended < 0 ||
    recommended >= answers.length
  ) {
    throw new Error(`question event has malformed raw.recommended_index: ${JSON.stringify(event)}`);
  }
  return {
    question_id: requireString(raw, 'question_id', event),
    question: requireString(raw, 'question', event),
    answers: answers as string[],
    recommended_index: recommended,
    origin: parseOrigin(raw.origin, event),
    status: 'pending',
    created_at: typeof raw.created_at === 'string' ? raw.created_at : event.at,
    expires_at: requireString(raw, 'expires_at', event),
  };
}

export function parseQuestionResolved(event: QuestionEvent): QuestionResolution {
  const raw = event.raw ?? {};
  const status = raw.status;
  if (typeof status !== 'string' || !STATUSES.includes(status as QuestionStatus)) {
    throw new Error(`question/resolved event has unknown raw.status: ${JSON.stringify(event)}`);
  }
  return {
    question_id: requireString(raw, 'question_id', event),
    status: status as QuestionStatus,
    answer: typeof raw.answer === 'string' ? raw.answer : undefined,
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
  };
}

// A resolution only stays on screen as a notice when the user may have been
// looking at the question: not when it was answered (the answerer knows), and
// not when the event is old backlog replayed on reconnect.
const NOTICE_FRESH_MS = 2 * 60 * 1000;

export function keepResolutionNotice(
  resolution: QuestionResolution,
  eventAt: string,
  now: number,
): boolean {
  if (resolution.status === 'answered') return false;
  const at = Date.parse(eventAt);
  return Number.isFinite(at) && now - at <= NOTICE_FRESH_MS;
}

// The answer form: a suggested answer is chosen explicitly (nothing is
// preselected, not even the recommendation), and typed text takes precedence.
export interface AnswerDraft {
  choice: number | null;
  text: string;
}

export function draftAnswer(question: AgentQuestion, draft: AnswerDraft): string | null {
  const text = draft.text.trim();
  if (text !== '') return text;
  if (draft.choice === null) return null;
  return question.answers[draft.choice] ?? null;
}

export function originLabel(origin: QuestionOrigin): string {
  switch (origin.session_type) {
    case 'ticket':
      return `${origin.architect_key} · ${origin.ticket_id ?? 'ticket'}`;
    case 'action':
      return `action · ${origin.action ?? 'execution'}`;
    default:
      return `${origin.architect_key} · architect`;
  }
}

export function remainingLabel(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'expiring…';
  const minutes = Math.ceil(ms / 60_000);
  return minutes <= 1 ? 'expires in under a minute' : `expires in ${minutes} min`;
}

export function resolutionMessage(question: AgentQuestion): string {
  switch (question.status) {
    case 'answered':
      return `Answered: ${question.answer ?? ''}`;
    case 'expired':
      return 'No longer answerable: nobody answered within 1 hour. The agent was told to stop and wait for you — continue in its conversation.';
    case 'interrupted':
      return `No longer answerable: ${question.reason ?? 'the daemon stopped'}. Continue in the agent's conversation.`;
    case 'cancelled':
      return `No longer answerable: ${question.reason ?? 'the question was cancelled'}.`;
    default:
      return '';
  }
}
