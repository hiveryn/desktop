import type { ActionRequest } from '@hiveryn/shared/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { type SessionRecord, useSessionStore } from './sessionStore';

const record: SessionRecord = {
  architectKey: 'p',
  id: 'c-1',
  type: 'companion',
  label: 'browser',
  contextId: 'browser',
  mainTerminalId: 't-1',
  tabs: [{ type: 'event-log' }],
};

const action = (id: string): ActionRequest => ({
  id,
  title: 't',
  description: 'd',
  origin: {
    architect_key: 'p',
    session_id: 'c-1',
    session_type: 'companion',
    companion: 'browser',
  },
  status: 'pending',
  created_at: '2026-10-30T00:00:00Z',
  expires_at: '2026-10-30T01:00:00Z',
});

describe('action requests in the session store', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().registerSession(record);
  });

  it('removes a decided request and keeps a withdrawn one as a notice', () => {
    const store = useSessionStore.getState();
    store.setAction(action('a'));
    store.setAction(action('b'));
    store.resolveAction({ action_id: 'a', status: 'accepted' }, false);
    store.resolveAction({ action_id: 'b', status: 'cancelled', reason: 'shutdown' }, true);
    const { actions } = useSessionStore.getState();
    expect(actions.a).toBeUndefined();
    expect(actions.b).toMatchObject({ status: 'cancelled', reason: 'shutdown' });
  });

  it('never dismisses a pending request, and a dismissed notice stays gone on backlog replay', () => {
    const store = useSessionStore.getState();
    store.setAction(action('a'));
    store.dismissAction('a');
    expect(useSessionStore.getState().actions.a?.status).toBe('pending');
    store.resolveAction({ action_id: 'a', status: 'expired' }, true);
    store.dismissAction('a');
    // Reconnect: the backlog replays required then the fresh resolution.
    store.setAction(action('a'));
    store.resolveAction({ action_id: 'a', status: 'expired' }, true);
    expect(useSessionStore.getState().actions.a).toBeUndefined();
  });

  it('keeps the recorded outcome of a decision whose answer was lost', () => {
    const store = useSessionStore.getState();
    store.setAction(action('a'));
    store.setAction(action('b'));
    // Accept on "a" got no answer; then its resolution arrives as an event.
    store.markActionUncertain('a');
    expect(useSessionStore.getState().actions.a).toMatchObject({
      status: 'pending',
      uncertain: true,
    });
    store.resolveAction({ action_id: 'a', status: 'accepted' }, false);
    expect(useSessionStore.getState().actions.a).toMatchObject({
      status: 'accepted',
      recorded: true,
      uncertain: false,
    });
    // The retry of "b" was refused with the recorded outcome.
    store.resolveAction({ action_id: 'b', status: 'expired' }, true, true);
    expect(useSessionStore.getState().actions.b).toMatchObject({
      status: 'expired',
      recorded: true,
    });
    // A later replay of the same resolution changes nothing; dismiss removes it.
    store.resolveAction({ action_id: 'a', status: 'accepted' }, false);
    expect(useSessionStore.getState().actions.a?.status).toBe('accepted');
    store.dismissAction('a');
    expect(useSessionStore.getState().actions.a).toBeUndefined();
  });

  it('drops the requests of a removed session', () => {
    useSessionStore.getState().setAction(action('a'));
    useSessionStore.getState().unregisterSession('c-1');
    expect(useSessionStore.getState().actions).toEqual({});
  });
});
