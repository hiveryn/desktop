import { MAX_QUESTION_RESPONSE_LENGTH, normalizeQuestionResponse } from '@hiveryn/shared/domain';
import * as React from 'react';
import { type QuestionEntry, useSessionStore } from '../../state/sessionStore';
import ApiEnvelopeError from '../ApiEnvelopeError/ApiEnvelopeError';
import Button from '../Button/Button';
import styles from './QuestionPanel.module.css';
import {
  type AnswerDraft,
  draftAnswer,
  originLabel,
  remainingLabel,
  resolutionMessage,
} from './questionModel';

// The daemon rejects an answer to a question that is no longer pending (409,
// with the reason) or unknown to this session (404). The resolved event then
// turns the card into a notice; until it arrives, show the daemon's reason.
function staleAnswerMessage(err: unknown): string | null {
  const e = err as { status?: number; message?: string } | null;
  if (e?.status === 409) return e.message ?? 'This question is no longer answerable.';
  if (e?.status === 404) return 'This question is no longer available.';
  return null;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface CardProps {
  question: QuestionEntry;
  now: number;
}

export const QuestionCard: React.FC<CardProps> = ({ question, now }) => {
  const setMinimized = useSessionStore((s) => s.setQuestionMinimized);
  const dismiss = useSessionStore((s) => s.dismissQuestion);
  const [draft, setDraft] = React.useState<AnswerDraft>({ choice: null, text: '' });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [stale, setStale] = React.useState<string | null>(null);

  const pending = question.status === 'pending';
  const answer = draftAnswer(question, draft);

  async function submit(): Promise<void> {
    if (!answer || submitting) return;
    const checked = normalizeQuestionResponse(answer);
    if (!checked.ok) {
      setError(new Error(checked.message));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await window.hiveryn.sessions.answerQuestion(
        question.origin.session_id,
        question.question_id,
        checked.answer,
      );
      // The resolved event removes the card too; this avoids a lingering
      // form if it is briefly delayed.
      useSessionStore.getState().resolveQuestion(
        { question_id: question.question_id, status: 'answered', answer: checked.answer },
        false,
      );
    } catch (err) {
      const message = staleAnswerMessage(err);
      if (message) setStale(message);
      else setError(err);
      setSubmitting(false);
    }
  }

  if (pending && question.minimized) {
    return (
      <li className={styles.minimized}>
        <span className={styles.badge}>Question</span>
        <span className={styles.minimizedText}>{question.question}</span>
        <Button theme="SECONDARY" onClick={() => setMinimized(question.question_id, false)}>
          Show
        </Button>
      </li>
    );
  }

  return (
    <li className={styles.card} data-status={question.status}>
      <div className={styles.header}>
        <span className={styles.badge}>Question</span>
        <span className={styles.origin}>{originLabel(question.origin)}</span>
        {pending && <span className={styles.expiry}>{remainingLabel(question.expires_at, now)}</span>}
      </div>
      <p className={styles.question}>{question.question}</p>

      {pending && !stale ? (
        <>
          <div className={styles.choices} role="radiogroup" aria-label="Suggested answers">
            {question.answers.map((text, i) => {
              const selected = draft.choice === i && draft.text.trim() === '';
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: answers are a fixed, ordered list
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={styles.choice}
                  data-selected={selected || undefined}
                  disabled={submitting}
                  onClick={() => setDraft({ choice: i, text: '' })}
                >
                  <span className={styles.choiceText}>{text}</span>
                  {i === question.recommended_index && (
                    <span className={styles.recommended}>recommended</span>
                  )}
                </button>
              );
            })}
          </div>
          <textarea
            className={styles.freeText}
            value={draft.text}
            maxLength={MAX_QUESTION_RESPONSE_LENGTH}
            placeholder="Or write your own answer"
            aria-label="Your own answer"
            rows={2}
            disabled={submitting}
            onChange={(e) => setDraft({ choice: null, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className={styles.actions}>
            <Button
              intent="success"
              onClick={() => void submit()}
              isDisabled={!answer || submitting}
            >
              Send answer
            </Button>
            <Button
              theme="SECONDARY"
              onClick={() => setMinimized(question.question_id, true)}
              title="Hide this question; it stays pending until you answer it"
            >
              Hide
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.notice}>{stale ?? resolutionMessage(question)}</p>
          {!pending && (
            <div className={styles.actions}>
              <Button theme="SECONDARY" onClick={() => dismiss(question.question_id)}>
                Dismiss
              </Button>
            </div>
          )}
        </>
      )}
      {error ? <ApiEnvelopeError error={error} title="Answer not sent" /> : null}
    </li>
  );
};

interface Props {
  sessionId: string | null;
}

// The questions of one agent session, shown over that session's main pane.
// Questions from other sessions surface as tab badges until their session is
// opened. Nothing here answers on its own: the recommendation is only marked.
const QuestionPanel: React.FC<Props> = ({ sessionId }) => {
  const all = useSessionStore((s) => s.questions);
  const now = useNow(15_000);
  const questions = Object.values(all)
    .filter((q) => q.origin.session_id === sessionId)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));

  if (!sessionId || questions.length === 0) return null;

  return (
    // Clicks stay in the panel: the pane underneath would move focus to the
    // terminal and away from the answer field.
    // biome-ignore lint/a11y/useKeyWithClickEvents: only stops propagation
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: only stops propagation
    <ul
      className={styles.panel}
      aria-label="Agent questions"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {questions.map((q) => (
        <QuestionCard key={q.question_id} question={q} now={now} />
      ))}
    </ul>
  );
};

export default QuestionPanel;
