import type { AgentMessage } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import { agentMessageViews } from './agentMessagesModel';

const now = Date.parse('2026-10-20T12:00:00Z');

function message(partial: Partial<AgentMessage>): AgentMessage {
  return {
    id: 'm',
    kind: 'ticket_concluded',
    recipient: 'architect:hiveryn',
    dedupe_key: 'k',
    body: 'Ticket T has been concluded.',
    payload: { ticket_id: 'T' },
    state: 'pending',
    attempts: 0,
    created_at: '2026-10-20T11:00:00Z',
    updated_at: '2026-10-20T11:00:00Z',
    ...partial,
  };
}

describe('agentMessageViews', () => {
  it('shows an open message only when the daemon says why it waits', () => {
    expect(agentMessageViews([message({ condition: undefined })], now)).toEqual([]);
    expect(
      agentMessageViews([message({ id: 'a', condition: 'no running architect session' })], now),
    ).toEqual([
      {
        id: 'a',
        tone: 'waiting',
        label: 'Conclusion notice for T',
        detail: 'no running architect session',
        attempts: 0,
      },
    ]);
  });

  it('labels an escalated worker question by its ticket', () => {
    const views = agentMessageViews(
      [
        message({
          id: 'm-q',
          kind: 'question_escalated',
          payload: { ticket_id: '2026-10-23-0412-escalate', question_id: 'q-1' },
          condition: 'no running architect session for hiveryn; delivered to its next session',
        }),
      ],
      now,
    );
    expect(views).toHaveLength(1);
    expect(views[0]?.label).toBe(
      'Unanswered worker question on 2026-10-23-0412-escalate for the architect',
    );
  });

  it('labels an action-ended notice by action, outcome and recipient', () => {
    const [view] = agentMessageViews(
      [
        message({
          id: 'a',
          kind: 'action_ended',
          recipient: 'session:w-1',
          payload: {
            execution_id: 'e-1',
            action: 'nova-export',
            outcome: 'failed',
            error: 'cancelled by user',
          },
          condition:
            'recipient session runs on machine bk; message delivery to remote sessions is not available, the message is retained',
        }),
      ],
      now,
    );
    expect(view.label).toBe('Action nova-export failed notice for session:w-1');
    expect(view.tone).toBe('waiting');
  });

  it('marks a message with failed attempts as retrying and carries the last error', () => {
    const [view] = agentMessageViews(
      [message({ attempts: 2, condition: 'retrying after 1m', last_error: 'boom' })],
      now,
    );
    expect(view.tone).toBe('retrying');
    expect(view.detail).toBe('retrying after 1m (last: boom)');
  });

  it('keeps a handed message as waiting even after earlier attempts', () => {
    const [view] = agentMessageViews(
      [message({ state: 'handed', attempts: 2, condition: 'awaiting the agent record' })],
      now,
    );
    expect(view.tone).toBe('waiting');
  });

  it('shows recent failures and hides delivered messages and old failures', () => {
    const views = agentMessageViews(
      [
        message({ id: 'done', state: 'acknowledged' }),
        message({ id: 'seen', state: 'appeared' }),
        message({
          id: 'old',
          state: 'failed',
          last_error: 'gone',
          ended_at: '2026-10-18T12:00:00Z',
        }),
        message({
          id: 'new',
          kind: 'note' as AgentMessage['kind'],
          recipient: 'session:s1',
          payload: undefined,
          state: 'failed',
          last_error: 'recipient session s1 no longer exists',
          ended_at: '2026-10-20T11:59:00Z',
          attempts: 1,
        }),
      ],
      now,
    );
    expect(views).toEqual([
      {
        id: 'new',
        tone: 'failed',
        label: 'note to session:s1',
        detail: 'recipient session s1 no longer exists',
        attempts: 1,
      },
    ]);
  });
});
