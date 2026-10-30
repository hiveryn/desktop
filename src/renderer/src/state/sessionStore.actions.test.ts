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

  it('drops the requests of a removed session', () => {
    useSessionStore.getState().setAction(action('a'));
    useSessionStore.getState().unregisterSession('c-1');
    expect(useSessionStore.getState().actions).toEqual({});
  });
});
