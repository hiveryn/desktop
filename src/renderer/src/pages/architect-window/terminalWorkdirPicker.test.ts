import type { CreateTerminalParams, SessionTab, TerminalWorkdir } from '@hiveryn/shared/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SessionRecord, useSessionStore } from '../../state/sessionStore';
import { createSelectedTerminal } from './terminalWorkdirPicker';

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
  create.mockImplementation(async (_sessionId: string, _body: CreateTerminalParams) => {
    daemonTabs = [...daemonTabs, { type: 'terminal', id: 'term-new' }];
    return { terminal_id: 'term-new', session_id: SESSION, command: 'zsh', status: 'running' };
  });
  vi.stubGlobal('window', {
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
