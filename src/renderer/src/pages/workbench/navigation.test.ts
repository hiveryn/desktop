import type { Session, SessionTab } from '@hiveryn/shared/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../../state/sessionStore';
import { activateLaunchedSession, selectSession } from './navigation';

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
