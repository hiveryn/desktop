import type { Session, SessionTab } from '@hiveryn/shared/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchitectStatus } from '../../../../shared/types';
import { useArchitectStatusStore } from '../../state/architectStatusStore';
import { useSessionStore } from '../../state/sessionStore';
import { activateLaunchedSession, cycleSession, selectSession } from './navigation';

function running(id: string, architectKey: string): Session {
  return {
    id,
    architect_key: architectKey,
    session_type: 'ticket',
    context_id: `ctx-${id}`,
    current_run: { status: 'running', main_terminal_id: `term-${id}`, profile_name: 'fixture' },
  } as unknown as Session;
}

let listed: Session[] = [];
let release: (() => void) | null = null;

beforeEach(() => {
  useSessionStore.getState().reset();
  listed = [running('a1', 'a'), running('b1', 'b')];
  vi.stubGlobal('window', {
    hiveryn: {
      sessions: {
        list: vi.fn(
          () =>
            new Promise<Session[]>((resolve) => {
              release = () => resolve(listed);
            }),
        ),
      },
      tabs: { list: vi.fn(async () => [{ type: 'event-log' }] as SessionTab[]) },
      session: { subscribe: vi.fn(async () => undefined) },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

// Lets the queued discovery sync reach its sessions.list call, then answers it.
async function answerList(): Promise<void> {
  for (let i = 0; i < 50 && !release; i++) await Promise.resolve();
  if (!release) throw new Error('sessions.list was never called');
  release();
  release = null;
}

describe('selectSession', () => {
  it('opens the project and shows the session once discovered', async () => {
    const pending = selectSession('a', 'a1');
    expect(useSessionStore.getState().selectedArchitectKey).toBe('a');
    await answerList();
    await pending;
    expect(useSessionStore.getState().activeSessionId).toBe('a1');
  });

  it('gives up when the user selected something newer meanwhile', async () => {
    const pending = selectSession('a', 'a1');
    useSessionStore.getState().selectArchitect('b');
    await answerList();
    await pending;
    expect(useSessionStore.getState().selectedArchitectKey).toBe('b');
    expect(useSessionStore.getState().activeSessionId).not.toBe('a1');
  });
});

describe('activateLaunchedSession', () => {
  it('activates only while no newer selection happened', () => {
    const store = useSessionStore.getState();
    store.reconcileArchitectSessions('a', [
      {
        architectKey: 'a',
        id: 'a1',
        type: 'ticket',
        label: 'a1',
        contextId: 'a1',
        mainTerminalId: 'm',
        tabs: [{ type: 'event-log' } as SessionTab],
      },
    ]);
    const epoch = useSessionStore.getState().selectionEpoch;
    useSessionStore.getState().selectArchitect('b');
    activateLaunchedSession('a1', epoch);
    expect(useSessionStore.getState().selectedArchitectKey).toBe('b');
    activateLaunchedSession('a1', useSessionStore.getState().selectionEpoch);
    expect(useSessionStore.getState().activeSessionId).toBe('a1');
  });
});

describe('cycleSession', () => {
  // Three projects with one running worker each; only 'a' is open.
  function status(key: string, sessionId: string): ArchitectStatus {
    return {
      key,
      name: key,
      path: `/ws/${key}`,
      status: null,
      session_id: null,
      sessions: [
        {
          id: sessionId,
          title: sessionId,
          status: 'running',
          agent_status: 'idle',
          started_at: '2026-10-29T00:00:00Z',
        },
      ],
    };
  }
  const listQueue: (() => void)[] = [];

  beforeEach(() => {
    listed = [running('a1', 'a'), running('b1', 'b'), running('c1', 'c')];
    listQueue.length = 0;
    vi.stubGlobal('window', {
      hiveryn: {
        sessions: {
          list: vi.fn(
            () => new Promise<Session[]>((resolve) => listQueue.push(() => resolve(listed))),
          ),
        },
        tabs: { list: vi.fn(async () => [{ type: 'event-log' }] as SessionTab[]) },
        session: { subscribe: vi.fn(async () => undefined) },
      },
    });
    useArchitectStatusStore.setState({
      statuses: [status('a', 'a1'), status('b', 'b1'), status('c', 'c1')],
    });
    const pending = selectSession('a', 'a1');
    return (async () => {
      for (let i = 0; i < 50 && listQueue.length === 0; i++) await Promise.resolve();
      listQueue.shift()?.();
      await pending;
    })();
  });

  async function answerAll(): Promise<void> {
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 50 && listQueue.length === 0; i++) await Promise.resolve();
      while (listQueue.length > 0) listQueue.shift()?.();
    }
  }

  it('reaches a session of an unopened project and focuses its terminal', async () => {
    expect(useSessionStore.getState().activeSessionId).toBe('a1');
    const step = cycleSession(1);
    expect(useSessionStore.getState().selectedArchitectKey).toBe('b');
    await answerAll();
    await step;
    expect(useSessionStore.getState().activeSessionId).toBe('b1');
    expect(useSessionStore.getState().focusedPane).toBe('main-terminal');
  });

  it('chains rapid presses from the pending target; the newest wins', async () => {
    const first = cycleSession(1); // → b1 (discovering)
    const second = cycleSession(1); // → c1, not b1 again
    await answerAll();
    await Promise.all([first, second]);
    expect(useSessionStore.getState().activeSessionId).toBe('c1');
  });

  it('wraps backwards from the first session to the last', async () => {
    const step = cycleSession(-1);
    await answerAll();
    await step;
    expect(useSessionStore.getState().activeSessionId).toBe('c1');
  });
});
