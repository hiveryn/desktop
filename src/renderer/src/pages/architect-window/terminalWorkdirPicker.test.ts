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
  { type: 'terminal', id: 'term-a', placement: 'tab' },
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
  create.mockImplementation(async (_sessionId: string, body: CreateTerminalParams) => {
    const id = body.placement === 'split' ? 'split-1' : 'term-new';
    daemonTabs = [
      ...daemonTabs,
      body.placement === 'split'
        ? { type: 'terminal', id, placement: 'split', base_tab_id: body.base_tab_id }
        : { type: 'terminal', id, placement: 'tab' },
    ];
    return { terminal_id: id, session_id: SESSION, command: 'zsh', status: 'running' };
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
  it('keeps a non-first originating tab selected and focuses its new split', async () => {
    await createSelectedTerminal(
      {
        sessionId: SESSION,
        placement: 'split',
        baseTabId: 'event-log',
        capturedActiveRightTab: 'event-log',
        capturedFocusedPane: 'right-event-log',
      },
      WORKDIR,
    );

    expect(create).toHaveBeenCalledWith(SESSION, {
      placement: 'split',
      base_tab_id: 'event-log',
      workdir_id: WORKDIR.id,
    });
    let state = useSessionStore.getState();
    expect(state.activeRightTab).toBe('event-log');
    expect(state.sessionRightTabs[SESSION]).toBe('event-log');
    expect(state.focusedPane).toBe('right-terminal:split-1');
    expect(state.sessions[SESSION].tabs.find((tab) => tab.id === 'split-1')?.base_tab_id).toBe(
      'event-log',
    );

    // A later tab refresh keeps both the selection and the split focus.
    state.setSessionTabs(SESSION, [...daemonTabs]);
    state = useSessionStore.getState();
    expect(state.activeRightTab).toBe('event-log');
    expect(state.focusedPane).toBe('right-terminal:split-1');

    // Session restoration (reconcile + switch back) restores the originating tab.
    state.reconcileSessions([record([...daemonTabs])]);
    state.setActiveSession(null);
    useSessionStore.getState().setActiveSession(SESSION);
    state = useSessionStore.getState();
    expect(state.activeRightTab).toBe('event-log');
  });

  it('still activates an ordinary new terminal tab', async () => {
    await createSelectedTerminal(
      {
        sessionId: SESSION,
        placement: 'tab',
        capturedActiveRightTab: 'event-log',
        capturedFocusedPane: 'right-event-log',
      },
      WORKDIR,
    );

    const state = useSessionStore.getState();
    expect(state.activeRightTab).toBe('term-new');
    expect(state.focusedPane).toBe('right-terminal:term-new');
  });

  it('does nothing when the captured picker context went stale', async () => {
    useSessionStore.getState().setActiveRightTab('kanban');
    await createSelectedTerminal(
      {
        sessionId: SESSION,
        placement: 'split',
        baseTabId: 'event-log',
        capturedActiveRightTab: 'event-log',
        capturedFocusedPane: 'right-event-log',
      },
      WORKDIR,
    );

    expect(create).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeRightTab).toBe('kanban');
  });

  it('refuses to select a split terminal as the active right tab', () => {
    const state = useSessionStore.getState();
    state.setSessionTabs(SESSION, [
      ...BASE_TABS,
      { type: 'terminal', id: 'split-1', placement: 'split', base_tab_id: 'event-log' },
    ]);
    expect(() => useSessionStore.getState().setActiveRightTab('split-1')).toThrow(/split terminal/);
    expect(useSessionStore.getState().activeRightTab).toBe('event-log');
  });
});
