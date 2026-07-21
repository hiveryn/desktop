import mdStyles from '@styles/markdown.module.css';
import type { Intent, IntentOrigin } from '@hiveryn/shared/domain';
import * as React from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSessionStore } from '../../state/sessionStore';
import ApiEnvelopeError from '../ApiEnvelopeError/ApiEnvelopeError';
import Button from '../Button/Button';
import { ChevronRight } from '../icons';
import styles from './IntentCenter.module.css';

// A 404 from approve/deny means the intent already resolved (policy fired, or
// another client answered). Treat it as success and let the card fall away.
function isAlreadyResolved(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 404;
}

function originLabel(origin: IntentOrigin): string {
  const key = origin.architect_key || 'architect';
  switch (origin.session_type) {
    case 'ticket':
      return origin.ticket_id ? `${key} · ${origin.ticket_id}` : `${key} · ticket`;
    case 'freeform':
      return `${key} · freeform`;
    default:
      return `${key} · architect`;
  }
}

// The label under the countdown. wait-then-allow auto-approves on expiry,
// wait-then-deny auto-denies; auto-allow never actually raises a card.
function autoVerb(policy: Intent['policy']): string | null {
  if (policy === 'wait-then-allow') return 'auto-approve';
  if (policy === 'wait-then-deny') return 'auto-deny';
  return null;
}

const MAX_STRING = 200;

function truncate(value: string): string {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
}

// A string worth rendering as its own markdown block when expanded (a conclusion
// or ticket body), versus a short scalar (repo, outcome) shown inline. Purely a
// shape heuristic — no field name or intent type is special-cased.
function isRichString(value: string): boolean {
  return value.includes('\n') || value.length > 80;
}

function isCommitList(value: unknown[]): value is { sha: string; repo: string }[] {
  return value.every(
    (v) =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as { sha?: unknown }).sha === 'string' &&
      typeof (v as { repo?: unknown }).repo === 'string',
  );
}

// A tool-agnostic view of an intent's payload: no field is conclude- or
// ticket-specific. Strings render as text, commit-shaped arrays as sha chips,
// string arrays as a comma list, everything else as compact JSON. Any future
// tool routed through the daemon intent system renders here with no change.
const PayloadField: React.FC<{ name: string; value: unknown; expanded: boolean }> = ({
  name,
  value,
  expanded,
}) => {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null;

  // Expanded: a body-shaped string renders as its own scrollable markdown block.
  if (expanded && typeof value === 'string' && isRichString(value)) {
    return (
      <div className={styles.fieldBlock}>
        <span className={styles.fieldName}>{name}</span>
        <div className={styles.markdownScroll}>
          <div className={mdStyles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  let rendered: React.ReactNode;
  if (typeof value === 'string') {
    rendered = <span className={styles.fieldValue}>{expanded ? value : truncate(value)}</span>;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    rendered = <span className={styles.fieldValue}>{String(value)}</span>;
  } else if (Array.isArray(value) && isCommitList(value)) {
    rendered = (
      <span className={styles.chips}>
        {value.map((c) => (
          <span key={`${c.repo}:${c.sha}`} className={styles.chip}>
            {c.repo}@{c.sha.slice(0, 7)}
          </span>
        ))}
      </span>
    );
  } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    rendered = <span className={styles.fieldValue}>{(value as string[]).join(', ')}</span>;
  } else {
    const json = JSON.stringify(value);
    rendered = <span className={styles.fieldValue}>{expanded ? json : truncate(json)}</span>;
  }

  return (
    <div className={styles.field}>
      <span className={styles.fieldName}>{name}</span>
      {rendered}
    </div>
  );
};

const IntentCard: React.FC<{ intent: Intent }> = ({ intent }) => {
  const clearPendingIntent = useSessionStore((s) => s.clearPendingIntent);
  const [remaining, setRemaining] = React.useState(intent.wait_seconds);
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<unknown | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  // Cosmetic countdown. The daemon's auto-resolve is authoritative — at zero we
  // show "resolving…" and wait for the resolved event to remove the card, never
  // taking the action locally.
  React.useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  async function resolve(action: () => Promise<unknown>): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      // The resolved SSE event clears this too; clearing here avoids a lingering
      // card if the event is briefly delayed.
      clearPendingIntent(intent.intent_id);
    } catch (err) {
      if (isAlreadyResolved(err)) {
        clearPendingIntent(intent.intent_id);
        return;
      }
      setError(err);
      setSubmitting(false);
    }
  }

  const approve = (): void => {
    void resolve(() =>
      window.hiveryn.sessions.approveIntent(intent.origin.session_id, intent.intent_id),
    );
  };

  const deny = (): void => {
    void resolve(() =>
      window.hiveryn.sessions.denyIntent(
        intent.origin.session_id,
        intent.intent_id,
        reason.trim() || undefined,
      ),
    );
  };

  const verb = autoVerb(intent.policy);
  const countdown = remaining > 0 ? (verb ? `${verb} ${remaining}s` : `${remaining}s`) : 'resolving…';

  return (
    <li className={styles.card}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          <ChevronRight
            className={expanded ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
            aria-hidden="true"
          />
          <span className={styles.origin} title={originLabel(intent.origin)}>
            {originLabel(intent.origin)}
          </span>
        </button>
        <span className={styles.countdown}>{countdown}</span>
      </div>
      {intent.summary && <div className={styles.summary}>{intent.summary}</div>}
      {intent.payload && (
        <div className={styles.payload}>
          {Object.entries(intent.payload).map(([name, value]) => (
            <PayloadField key={name} name={name} value={value} expanded={expanded} />
          ))}
        </div>
      )}
      <div className={styles.actions}>
        <Button
          className={styles.approve}
          intent="success"
          onClick={approve}
          isDisabled={submitting}
        >
          Approve
        </Button>
        <div className={styles.denyRow}>
          <input
            className={styles.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="reason (optional)"
            disabled={submitting}
            aria-label="Denial reason"
          />
          <Button
            className={styles.deny}
            intent="destructive"
            onClick={deny}
            isDisabled={submitting}
          >
            Deny
          </Button>
        </div>
      </div>
      {error ? <ApiEnvelopeError error={error} title="Intent API Error" /> : null}
    </li>
  );
};

// Window-level, cross-session popup of every pending intent for the sessions in
// this architect window. Keyed by intent id; a single session can raise several.
const IntentCenter: React.FC = () => {
  const pendingIntents = useSessionStore((s) => s.pendingIntents);
  // Newest first, so a just-raised intent lands at the top of the stack.
  const intents = Object.values(pendingIntents).sort(
    (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0),
  );

  if (intents.length === 0) return null;

  return createPortal(
    <ul className={styles.stack} aria-label="Pending intents">
      {intents.map((intent) => (
        <IntentCard key={intent.intent_id} intent={intent} />
      ))}
    </ul>,
    document.body,
  );
};

export default IntentCenter;
