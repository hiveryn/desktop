import mdStyles from '@styles/markdown.module.css';
import type {
  Intent,
  IntentInputField,
  IntentInputValue,
  IntentInputValues,
  IntentOrigin,
} from '@hiveryn/shared/domain';
import * as React from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSessionStore } from '../../state/sessionStore';
import ApiEnvelopeError from '../ApiEnvelopeError/ApiEnvelopeError';
import Button from '../Button/Button';
import { ChevronRight } from '../icons';
import styles from './IntentCenter.module.css';
import { awaitsUserInput, initialInputValues, inputValueErrors } from './intentInputsModel';

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

// ── Typed payload extraction ─────────────────────────────────────────────────
// The daemon authors these payloads (intents_service.go / service.go), so a
// shape mismatch is a bug — throw with the field, never render a wrong card.

interface IntentCommit {
  sha: string;
  repo: string;
}

function requirePayload(intent: Intent): Record<string, unknown> {
  if (!intent.payload) {
    throw new Error(`intent ${intent.intent_id} (${intent.intent_type}) is missing its payload`);
  }
  return intent.payload;
}

function requireString(payload: Record<string, unknown>, key: string, intentId: string): string {
  const value = payload[key];
  if (typeof value !== 'string') {
    throw new Error(`intent ${intentId}: payload field "${key}" is not a string`);
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, key: string, intentId: string): string {
  const value = payload[key];
  if (value == null) return '';
  if (typeof value !== 'string') {
    throw new Error(`intent ${intentId}: payload field "${key}" is not a string`);
  }
  return value;
}

function optionalStringArray(
  payload: Record<string, unknown>,
  key: string,
  intentId: string,
): string[] {
  const value = payload[key];
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(`intent ${intentId}: payload field "${key}" is not a string array`);
  }
  return value;
}

function optionalCommitArray(
  payload: Record<string, unknown>,
  key: string,
  intentId: string,
): IntentCommit[] {
  const value = payload[key];
  if (value == null) return [];
  const isCommit = (v: unknown): v is IntentCommit =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { sha?: unknown }).sha === 'string' &&
    typeof (v as { repo?: unknown }).repo === 'string';
  if (!Array.isArray(value) || !value.every(isCommit)) {
    throw new Error(`intent ${intentId}: payload field "${key}" is not a commit array`);
  }
  return value;
}

// ── Generic fallback rendering (unknown future intent types) ─────────────────

// A string worth rendering as its own markdown block when expanded, versus a
// short scalar shown inline. Purely a shape heuristic.
function isRichString(value: string): boolean {
  return value.includes('\n') || value.length > 80;
}

function isCommitList(value: unknown[]): value is IntentCommit[] {
  return value.every(
    (v) =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as { sha?: unknown }).sha === 'string' &&
      typeof (v as { repo?: unknown }).repo === 'string',
  );
}

const MarkdownBlock: React.FC<{ label: string; children: string }> = ({ label, children }) => (
  <div className={styles.fieldBlock}>
    <span className={styles.fieldName}>{label}</span>
    <div className={styles.markdownScroll}>
      <div className={mdStyles.markdown}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
      </div>
    </div>
  </div>
);

// Tool-agnostic view of a payload field, used only for intent types without a
// dedicated design below. Strings render as text, commit-shaped arrays as sha
// chips, string arrays as a comma list, everything else as compact JSON.
const PayloadField: React.FC<{ name: string; value: unknown; expanded: boolean }> = ({
  name,
  value,
  expanded,
}) => {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null;

  // Expanded: a body-shaped string renders as its own scrollable markdown block.
  if (expanded && typeof value === 'string' && isRichString(value)) {
    return <MarkdownBlock label={name}>{value}</MarkdownBlock>;
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

// ── Type-specific designs ────────────────────────────────────────────────────

// createWorkTicket: the summary is the ticket title; the payload carries the
// repo scope, references, and the markdown body (shown expanded).
const TicketIntentDetails: React.FC<{ intent: Intent; expanded: boolean }> = ({
  intent,
  expanded,
}) => {
  const payload = requirePayload(intent);
  const repo = requireString(payload, 'repo', intent.intent_id);
  const additionalRepos = optionalStringArray(payload, 'additional_repos', intent.intent_id);
  const references = optionalStringArray(payload, 'references', intent.intent_id);
  const body = optionalString(payload, 'body', intent.intent_id);

  return (
    <div className={styles.details}>
      <div className={styles.metaRow}>
        <span className={styles.chip}>
          {repo}
          {additionalRepos.length > 0 && <span className={styles.chipTag}> primary</span>}
        </span>
        {additionalRepos.map((key) => (
          <span key={key} className={styles.chip}>
            {key}
          </span>
        ))}
        {!expanded && references.length > 0 && (
          <span className={styles.metaNote}>
            {references.length} reference{references.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {expanded && references.length > 0 && (
        <div className={styles.fieldBlock}>
          <span className={styles.fieldName}>references</span>
          <ul className={styles.refList}>
            {references.map((ref) => (
              <li key={ref} className={styles.refItem}>
                {ref.startsWith('/') ? `path · ${ref}` : `ticket · ${ref}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {expanded && body && <MarkdownBlock label="body">{body}</MarkdownBlock>}
    </div>
  );
};

// concludeSession: the summary is the TL;DR; the payload carries the outcome,
// commits, optional rejection reason, and the full rendered conclusion body
// (shown expanded). Architect conclusions only carry the body.
const ConclusionIntentDetails: React.FC<{ intent: Intent; expanded: boolean }> = ({
  intent,
  expanded,
}) => {
  const payload = requirePayload(intent);
  const body = requireString(payload, 'body', intent.intent_id);
  const outcome = optionalString(payload, 'outcome', intent.intent_id);
  const rejectionReason = optionalString(payload, 'rejection_reason', intent.intent_id);
  const commits = optionalCommitArray(payload, 'commits', intent.intent_id);

  return (
    <div className={styles.details}>
      {(outcome || commits.length > 0) && (
        <div className={styles.metaRow}>
          {outcome && (
            <span className={styles.outcomeBadge} data-outcome={outcome}>
              {outcome}
            </span>
          )}
          {expanded ? (
            commits.map((c) => (
              <span key={`${c.repo}:${c.sha}`} className={styles.chip}>
                {c.repo}@{c.sha.slice(0, 7)}
              </span>
            ))
          ) : commits.length > 0 ? (
            <span className={styles.metaNote}>
              {commits.length} commit{commits.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      )}
      {rejectionReason && (
        <div className={styles.rejectionBlock}>
          <span className={styles.fieldName}>rejection reason</span>
          <span className={styles.fieldValue}>
            {expanded ? rejectionReason : truncate(rejectionReason)}
          </span>
        </div>
      )}
      {expanded && <MarkdownBlock label="conclusion">{body}</MarkdownBlock>}
    </div>
  );
};

// ── Approval inputs ──────────────────────────────────────────────────────────

const InputControl: React.FC<{
  id: string;
  field: IntentInputField;
  value: IntentInputValue | undefined;
  error: string | undefined;
  onChange: (value: IntentInputValue) => void;
}> = ({ id, field, value, error, onChange }) => {
  const text = typeof value === 'string' ? value : '';
  const describedBy = error ? `${id}-error` : field.description ? `${id}-hint` : undefined;
  const common = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': field.required || undefined,
  };

  let control: React.ReactNode;
  switch (field.type) {
    case 'boolean':
      return (
        <div className={styles.inputField}>
          <label className={styles.inputCheck} htmlFor={id}>
            <input
              {...common}
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span>{field.label}</span>
          </label>
          {field.description && (
            <span id={`${id}-hint`} className={styles.inputHint}>
              {field.description}
            </span>
          )}
        </div>
      );
    case 'choice':
      control = (
        <select
          {...common}
          className={styles.inputControl}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{field.required ? 'Select…' : '—'}</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value} title={o.description}>
              {o.label || o.value}
            </option>
          ))}
        </select>
      );
      break;
    case 'textarea':
      control = (
        <textarea
          {...common}
          className={styles.inputControl}
          rows={3}
          value={text}
          maxLength={field.max_length || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    default:
      control = (
        <input
          {...common}
          className={styles.inputControl}
          value={text}
          maxLength={field.max_length || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className={styles.inputField}>
      <label className={styles.fieldName} htmlFor={id}>
        {field.label}
        {field.required && <span className={styles.inputRequired}> *</span>}
      </label>
      {control}
      {error ? (
        <span id={`${id}-error`} className={styles.inputError}>
          {error}
        </span>
      ) : (
        field.description && (
          <span id={`${id}-hint`} className={styles.inputHint}>
            {field.description}
          </span>
        )
      )}
    </div>
  );
};

// The fields the user completes as part of approving. Denying never needs them.
const IntentInputsForm: React.FC<{
  intent: Intent;
  fields: IntentInputField[];
  values: IntentInputValues;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (name: string, value: IntentInputValue) => void;
}> = ({ intent, fields, values, errors, disabled, onChange }) => (
  <fieldset className={styles.inputs} disabled={disabled}>
    {awaitsUserInput(intent) && (
      <p className={styles.inputNotice} role="status">
        Needs your input — will not {intent.policy === 'auto-allow' ? 'run' : 'auto-approve'}:{' '}
        {intent.unresolved_inputs?.map((i) => `${i.field} ${i.message}`).join('; ')}
      </p>
    )}
    {fields.map((field) => (
      <InputControl
        key={field.name}
        id={`intent-${intent.intent_id}-${field.name}`}
        field={field}
        value={values[field.name]}
        error={errors[field.name]}
        onChange={(value) => onChange(field.name, value)}
      />
    ))}
  </fieldset>
);

type IntentKind = 'ticket' | 'conclude' | null;

function kindOf(type: Intent['intent_type']): IntentKind {
  if (type === 'createWorkTicket') return 'ticket';
  if (type === 'concludeSession') return 'conclude';
  return null;
}

const KIND_LABEL: Record<Exclude<IntentKind, null>, string> = {
  ticket: 'new ticket',
  conclude: 'conclude session',
};

const IntentCard: React.FC<{ intent: Intent }> = ({ intent }) => {
  const clearPendingIntent = useSessionStore((s) => s.clearPendingIntent);
  const [remaining, setRemaining] = React.useState(intent.wait_seconds);
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<unknown | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const fields = intent.inputs ?? [];
  const [values, setValues] = React.useState<IntentInputValues>(() => initialInputValues(fields));
  // Field errors show only after an approve attempt, then track edits live.
  const [showInputErrors, setShowInputErrors] = React.useState(false);
  const inputErrors = showInputErrors ? inputValueErrors(fields, values) : {};

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
    if (fields.length > 0 && Object.keys(inputValueErrors(fields, values)).length > 0) {
      setShowInputErrors(true);
      return;
    }
    void resolve(() =>
      window.hiveryn.sessions.approveIntent(
        intent.origin.session_id,
        intent.intent_id,
        fields.length > 0 ? values : undefined,
      ),
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

  // Unresolved inputs block automatic approval, so there is nothing to count
  // down to: the card waits for the user.
  const verb = autoVerb(intent.policy);
  const countdown = awaitsUserInput(intent)
    ? 'needs input'
    : remaining > 0
      ? verb
        ? `${verb} ${remaining}s`
        : `${remaining}s`
      : 'resolving…';

  const kind = kindOf(intent.intent_type);
  // Surfaced at the card level so a rejected conclusion's accent edge turns
  // red; the typed detail component re-validates the field strictly.
  const cardOutcome =
    kind === 'conclude' && typeof intent.payload?.outcome === 'string'
      ? intent.payload.outcome
      : undefined;

  return (
    <li
      className={styles.card}
      data-kind={kind ?? undefined}
      data-outcome={cardOutcome}
      data-expanded={expanded || undefined}
    >
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
      <button
        type="button"
        className={styles.summaryToggle}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {kind && (
          <span className={styles.kindBadge} data-kind={kind}>
            {KIND_LABEL[kind]}
          </span>
        )}
        {intent.summary && <span className={styles.summary}>{intent.summary}</span>}
      </button>
      {kind === 'ticket' ? (
        <TicketIntentDetails intent={intent} expanded={expanded} />
      ) : kind === 'conclude' ? (
        <ConclusionIntentDetails intent={intent} expanded={expanded} />
      ) : (
        intent.payload && (
          <div className={styles.details}>
            {Object.entries(intent.payload).map(([name, value]) => (
              <PayloadField key={name} name={name} value={value} expanded={expanded} />
            ))}
          </div>
        )
      )}
      {fields.length > 0 && (
        <IntentInputsForm
          intent={intent}
          fields={fields}
          values={values}
          errors={inputErrors}
          disabled={submitting}
          onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
        />
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
