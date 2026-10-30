import mdStyles from '@styles/markdown.module.css';
import type { ActionDecision, ActionRequest } from '@hiveryn/shared/domain';
import * as React from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSessionStore } from '../../state/sessionStore';
import ApiEnvelopeError from '../ApiEnvelopeError/ApiEnvelopeError';
import Button from '../Button/Button';
import Dialog from '../Dialog/Dialog';
import styles from './ActionCenter.module.css';
import {
  decisionRequest,
  isDecidable,
  originLabel,
  remainingLabel,
  resolutionMessage,
} from './actionModel';

// Companion action requests (requestAction) of the selected project: a
// compact card per request, and the decision dialog with the exact proposal
// and Accept / Deny / Reply. The request goes to the user only — never to the
// architect — and nothing is accepted automatically. The daemon is the only
// authority on whether a request is still decidable: a 409 names why it no
// longer is, and past its expiry the dialog stops offering a decision even
// before the daemon's resolution arrives.

function useNow(intervalMs: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function errorStatus(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status;
}

function errorMessage(err: unknown): string {
  return (err as { message?: string } | null)?.message ?? String(err);
}

interface DialogProps {
  action: ActionRequest;
  onClose(): void;
}

export function ActionDecisionDialog({ action, onClose }: DialogProps) {
  const now = useNow(1000);
  const [reply, setReply] = React.useState('');
  const [exact, setExact] = React.useState(false);
  const [submitting, setSubmitting] = React.useState<ActionDecision | null>(null);
  const [error, setError] = React.useState<unknown | null>(null);
  // A 409/404: the daemon says the request can no longer be decided.
  const [closedReason, setClosedReason] = React.useState<string | null>(null);

  const decidable = isDecidable(action, now) && closedReason === null;

  async function decide(decision: ActionDecision): Promise<void> {
    const request = decisionRequest(decision, reply);
    if (!request || !decidable) return;
    setSubmitting(decision);
    setError(null);
    try {
      await window.hiveryn.sessions.decideAction(action.origin.session_id, action.id, request);
      // The resolved event removes the request everywhere; drop it here at
      // once so the dialog never offers a second decision.
      useSessionStore.getState().resolveAction(
        { action_id: action.id, status: decision === 'accept' ? 'accepted' : decision === 'deny' ? 'denied' : 'replied' },
        false,
      );
      onClose();
    } catch (err) {
      const status = errorStatus(err);
      if (status === 409 || status === 404) {
        setClosedReason(
          status === 404 ? 'this request is unknown to its session' : errorMessage(err),
        );
      } else {
        setError(err);
      }
      setSubmitting(null);
    }
  }

  const replyRequest = decisionRequest('reply', reply);
  const footer = (
    <div className={styles.footerButtons}>
      <Button
        theme="SECONDARY"
        intent="destructive"
        isDisabled={!decidable || submitting !== null}
        onClick={() => void decide('deny')}
      >
        DENY
      </Button>
      <Button
        theme="SECONDARY"
        isDisabled={!decidable || submitting !== null || replyRequest === null}
        onClick={() => void decide('reply')}
      >
        REPLY
      </Button>
    </div>
  );

  return (
    <Dialog
      title={`Action request · ${originLabel(action.origin)}`}
      confirmLabel="ACCEPT"
      confirmDisabled={!decidable || submitting !== null}
      onConfirm={() => void decide('accept')}
      onCancel={onClose}
      cancelLabel="LATER"
      footerLeft={footer}
      isolateKeys
    >
      <div className={styles.dialogBody} data-action-id={action.id}>
        <div className={styles.dialogTitle}>{action.title}</div>
        <div className={styles.meta}>
          {decidable
            ? `${remainingLabel(action.expires_at, now)} · accepting authorizes only this proposal; the companion executes it`
            : action.status !== 'pending'
              ? resolutionMessage(action)
              : closedReason
                ? `No longer decidable: ${closedReason}. Nothing was authorized.`
                : remainingLabel(action.expires_at, now)}
        </div>
        <div className={styles.proposalHeader}>
          <span>Proposal</span>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={exact}
            onClick={() => setExact((v) => !v)}
          >
            {exact ? 'rendered' : 'exact text'}
          </button>
        </div>
        <div className={styles.proposal} data-testid="action-proposal">
          {exact ? (
            <pre className={styles.exact}>{action.description}</pre>
          ) : (
            <div className={mdStyles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{action.description}</ReactMarkdown>
            </div>
          )}
        </div>
        <textarea
          className={styles.reply}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Reply with a message instead (authorizes nothing)…"
          rows={3}
          disabled={!decidable}
          aria-label="Reply message"
        />
        {error ? <ApiEnvelopeError error={error} title="Decision error" /> : null}
      </div>
    </Dialog>
  );
}

interface CenterProps {
  architectKey: string | null;
}

export default function ActionCenter({ architectKey }: CenterProps) {
  const allActions = useSessionStore((s) => s.actions);
  const dismissAction = useSessionStore((s) => s.dismissAction);
  const now = useNow(15_000);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const actions = React.useMemo(
    () =>
      Object.values(allActions)
        .filter((a) => a.origin.architect_key === architectKey)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [allActions, architectKey],
  );

  const open = openId ? allActions[openId] : undefined;

  if (actions.length === 0 && !open) return null;

  return (
    <>
      {createPortal(
        <ul className={styles.stack} aria-label="Action requests">
          {actions.map((action) => {
            const pending = action.status === 'pending';
            return (
              <li
                key={action.id}
                className={styles.card}
                data-status={action.status}
                data-decidable={isDecidable(action, now) || undefined}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.badge}>ACTION REQUEST</span>
                  <span className={styles.origin}>{originLabel(action.origin)}</span>
                </div>
                <div className={styles.cardTitle}>{action.title}</div>
                <div className={styles.meta}>
                  {pending ? remainingLabel(action.expires_at, now) : resolutionMessage(action)}
                </div>
                <div className={styles.cardActions}>
                  {pending ? (
                    <Button onClick={() => setOpenId(action.id)}>REVIEW</Button>
                  ) : (
                    <Button theme="SECONDARY" onClick={() => dismissAction(action.id)}>
                      DISMISS
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
      {open && <ActionDecisionDialog action={open} onClose={() => setOpenId(null)} />}
    </>
  );
}
