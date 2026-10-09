import type { CreateTerminalParams, SessionTab, TerminalWorkdir } from '@hiveryn/shared/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SessionRecord, useSessionStore } from '../../state/sessionStore';
import {
  createSelectedTerminal,
  requestTerminalCreation,
  TERMINAL_WORKDIR_REQUEST,
  usePendingTerminalStore,
} from './terminalWorkdirPicker';

const SESSION = 'session-1';
const WORKDIR: TerminalWorkdir = {
  id: 'repo:desktop',
  title: 'desktop',
  path: '/repo/desktop',
  display_path: '~/repo/desktop',
  default: true,
};
const BASE_TABS: SessionTab[] = [
  { type: 'kanban' },
  { type: 'event-log' },
  { type: 'terminal', id: 'term-a' },
];

let daemonTabs: SessionTab[];
const create = vi.fn();
const dispatchEvent = vi.fn();
const REQUEST = {
  sessionId: SESSION,
  capturedActiveRightTab: 'event-log',
  capturedFocusedPane: 'right-event-log',
};
const REMOTE: TerminalWorkdir = { ...WORKDIR, id: 'repo:remote', title: 'remote', machine: 'bk' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function record(tabs: SessionTab[]): SessionRecord {
  return {
    id: SESSION,
    type: 'architect',
    label: 'architect',
    contextId: 'hiveryn',
    mainTerminalId: 'main-1',
    tabs,
  };
}

beforeEach(() => {
  daemonTabs = [...BASE_TABS];
  create.mockReset();
  dispatchEvent.mockReset();
  create.mockImplementation(async (_sessionId: string, _body: CreateTerminalParams) => {
    daemonTabs = [...daemonTabs, { type: 'terminal', id: 'term-new' }];
    return { terminal_id: 'term-new', session_id: SESSION, command: 'zsh', status: 'running' };
  });
  usePendingTerminalStore.setState({ bySession: {} });
  vi.stubGlobal('window', {
    dispatchEvent,
    hiveryn: {
      terminals: { create },
      tabs: { list: async () => daemonTabs },
    },
  });
  const store = useSessionStore.getState();
  store.reset();
  store.registerSession(record(BASE_TABS));
  store.setActiveSession(SESSION);
  store.setActiveRightTab('event-log');
  store.setFocusedPane('right-event-log');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSelectedTerminal', () => {
  it('creates the terminal in the chosen workdir and activates its tab', async () => {
    await createSelectedTerminal(
      {
        sessionId: SESSION,
        capturedActiveRightTab: 'event-log',
        capturedFocusedPane: 'right-event-log',
      },
      WORKDIR,
    );

    expect(create).toHaveBeenCalledWith(SESSION, { workdir_id: WORKDIR.id });
    let state = useSessionStore.getState();
    expect(state.activeRightTab).toBe('term-new');
    expect(state.sessionRightTabs[SESSION]).toBe('term-new');
    expect(state.focusedPane).toBe('right-terminal:term-new');

    // Session restoration (reconcile + switch back) restores the new tab.
    state.reconcileSessions([record([...daemonTabs])]);
    state.setActiveSession(null);
    useSessionStore.getState().setActiveSession(SESSION);
    state = useSessionStore.getState();
    expect(state.activeRightTab).toBe('term-new');
  });

  it('does nothing when the captured picker context went stale', async () => {
    useSessionStore.getState().setActiveRightTab('kanban');
    await createSelectedTerminal(
      {
        sessionId: SESSION,
        capturedActiveRightTab: 'event-log',
        capturedFocusedPane: 'right-event-log',
      },
      WORKDIR,
    );

    expect(create).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeRightTab).toBe('kanban');
  });
});

describe('pending terminal creation', () => {
  it('shows the pending terminal with its machine until a slow creation succeeds', async () => {
    const slow = deferred<unknown>();
    create.mockImplementation(async () => {
      await slow.promise;
      daemonTabs = [...daemonTabs, { type: 'terminal', id: 'term-new' }];
      return { terminal_id: 'term-new', session_id: SESSION, command: 'ssh', status: 'running' };
    });
    const done = createSelectedTerminal(REQUEST, REMOTE);

    const pending = usePendingTerminalStore.getState().bySession[SESSION];
    expect(pending).toMatchObject({ title: 'remote', machine: 'bk' });
    // A second "+" or a second pick while pending submits nothing.
    requestTerminalCreation(REQUEST);
    expect(dispatchEvent).not.toHaveBeenCalled();
    await createSelectedTerminal(REQUEST, REMOTE);
    expect(create).toHaveBeenCalledTimes(1);

    slow.resolve(undefined);
    await done;
    expect(usePendingTerminalStore.getState().bySession[SESSION]).toBeUndefined();
    expect(useSessionStore.getState().activeRightTab).toBe('term-new');
    requestTerminalCreation(REQUEST);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: TERMINAL_WORKDIR_REQUEST }),
    );
  });

  it('clears pending state on failure and shows a terminal the daemon still opened', async () => {
    // A timed-out request whose terminal the daemon finished anyway.
    create.mockImplementation(async () => {
      daemonTabs = [...daemonTabs, { type: 'terminal', id: 'term-late' }];
      throw Object.assign(new Error('The daemon did not answer POST … within 90s'), {
        code: 'TIMEOUT',
      });
    });
    await createSelectedTerminal(REQUEST, REMOTE);

    expect(usePendingTerminalStore.getState().bySession[SESSION]).toBeUndefined();
    const tabs = useSessionStore.getState().sessions[SESSION].tabs;
    expect(tabs.map((tab) => tab.id)).toContain('term-late');
    // The user stays where they were; nothing claims success.
    expect(useSessionStore.getState().activeRightTab).toBe('event-log');
  });

  it('keeps sessions independent', async () => {
    const slow = deferred<unknown>();
    create.mockImplementation(() => slow.promise);
    const done = createSelectedTerminal(REQUEST, REMOTE);
    requestTerminalCreation({ ...REQUEST, sessionId: 'other-session' });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    slow.reject(new Error('failed'));
    await done;
  });
});

describe('legacy split terminals', () => {
  it('treats a terminal an older daemon reports as a split as an ordinary tab', () => {
    // Fields from the removed split contract; the desktop must ignore them so
    // such a terminal is selectable instead of stranded off the tab bar.
    const legacy = {
      type: 'terminal',
      id: 'split-1',
      placement: 'split',
      base_tab_id: 'event-log',
    };
    const state = useSessionStore.getState();
    state.setSessionTabs(SESSION, [...BASE_TABS, legacy as SessionTab]);
    useSessionStore.getState().setActiveRightTab('split-1');
    useSessionStore.getState().setFocusedPane('right-terminal:split-1');
    const after = useSessionStore.getState();
    expect(after.activeRightTab).toBe('split-1');

    // A refresh keeps the selection: it is a valid right-pane tab.
    after.setSessionTabs(SESSION, [...BASE_TABS, legacy as SessionTab]);
    expect(useSessionStore.getState().activeRightTab).toBe('split-1');
    expect(useSessionStore.getState().focusedPane).toBe('right-terminal:split-1');
  });
});
