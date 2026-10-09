import type { Session, SessionTab } from '@hiveryn/shared/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useErrorCenterStore } from '../../../state/errorCenterStore';
import { useSessionStore } from '../../../state/sessionStore';
import { syncSessionsForArchitect } from './sessionSnapshot';

function running(id: string, type: Session['session_type']): Session {
  return {
    id,
    architect_key: 'iso',
    session_type: type,
    context_id: `ctx-${id}`,
    current_run: { status: 'running', main_terminal_id: `term-${id}`, profile_name: 'fixture' },
  } as unknown as Session;
}

function stubDaemon(sessions: Session[], tabs: Record<string, SessionTab[]> | Error): void {
  vi.stubGlobal('window', {
    hiveryn: {
      sessions: { list: vi.fn(async () => sessions) },
      tabs: {
        list: vi.fn(async (id: string) => {
          if (tabs instanceof Error) throw tabs;
          return tabs[id] ?? [];
        }),
      },
      session: { subscribe: vi.fn(async () => undefined) },
    },
  });
}

describe('syncSessionsForArchitect', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useErrorCenterStore.setState({ entries: [], unreadCount: 0 });
  });

  it('reports a session without right-pane tabs and still shows the others', async () => {
    stubDaemon([running('arch', 'architect'), running('work', 'ticket')], {
      work: [{ type: 'ticket' } as SessionTab],
    });
    await syncSessionsForArchitect('iso');
    expect(Object.keys(useSessionStore.getState().sessions)).toEqual(['work']);
    const [entry] = useErrorCenterStore.getState().entries;
    expect(entry?.message).toMatch(/arch .*no right-pane tabs.*tabs\.yaml/);
  });

  it('reports a failed sync instead of rejecting into nowhere', async () => {
    stubDaemon([running('arch', 'architect')], new Error('daemon unreachable'));
    await expect(syncSessionsForArchitect('iso')).resolves.toEqual([]);
    const [entry] = useErrorCenterStore.getState().entries;
    expect(entry?.title).toBe('Session discovery');
    expect(entry?.message).toContain('daemon unreachable');
  });
});

describe('remote activity freshness', () => {
  it('clears activity on disconnect and waits for a new hook after reconnect', async () => {
    useSessionStore.getState().reset();
    const session = running('remote', 'ticket');
    session.machine = 'buildbox';
    session.connection = 'connected';
    if (session.current_run) session.current_run.agent_status = 'active';
    stubDaemon([session], { remote: [{ type: 'ticket' } as SessionTab] });
    await syncSessionsForArchitect('iso');
    expect(useSessionStore.getState().sessions.remote.machine).toBe('buildbox');
    const store = useSessionStore.getState();
    store.setSessionConnection('remote', 'disconnected', 'SSH lost');
    store.setSessionStatus('remote', 'active');
    expect(useSessionStore.getState().sessions.remote.status).toBeUndefined();
    store.setSessionConnection('remote', 'connected');
    expect(useSessionStore.getState().sessions.remote.status).toBeUndefined();
    store.setSessionStatus('remote', 'idle');
    expect(useSessionStore.getState().sessions.remote.status).toBe('idle');
  });
});
