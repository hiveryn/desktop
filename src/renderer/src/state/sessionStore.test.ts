import type { SessionTab } from '@hiveryn/shared/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { type SessionRecord, useSessionStore } from './sessionStore';

const TABS: SessionTab[] = [{ type: 'kanban' }, { type: 'event-log' }] as SessionTab[];

function rec(id: string, architectKey: string, type: SessionRecord['type']): SessionRecord {
  return {
    architectKey,
    id,
    type,
    label: id,
    contextId: id,
    mainTerminalId: `m-${id}`,
    tabs: TABS,
  };
}

const store = () => useSessionStore.getState();

describe('workbench session store', () => {
  beforeEach(() => {
    store().reset();
    store().reconcileArchitectSessions('a', [
      rec('a-arch', 'a', 'architect'),
      rec('a-w1', 'a', 'ticket'),
    ]);
    store().reconcileArchitectSessions('b', [
      rec('b-arch', 'b', 'architect'),
      rec('b-w1', 'b', 'ticket'),
    ]);
  });

  it('shows nothing until a project is selected, then its architect session', () => {
    expect(store().activeSessionId).toBeNull();
    store().selectArchitect('a');
    expect(store().selectedArchitectKey).toBe('a');
    expect(store().activeSessionId).toBe('a-arch');
    expect(store().openArchitects).toEqual(['a']);
  });

  it('restores each project’s last session, right tab, focus and maximize', () => {
    store().setActiveSession('a-w1');
    store().setActiveRightTab('event-log');
    store().setFocusedPane('right-event-log');
    store().setMaximizedPane('right-event-log');
    store().setActiveSession('b-arch');
    expect(store().selectedArchitectKey).toBe('b');
    expect(store().focusedPane).toBe('main-terminal');
    expect(store().maximizedPane).toBeNull();
    store().selectArchitect('a');
    expect(store().activeSessionId).toBe('a-w1');
    expect(store().activeRightTab).toBe('event-log');
    expect(store().focusedPane).toBe('right-event-log');
    expect(store().maximizedPane).toBe('right-event-log');
  });

  it('reconciles one project without touching another', () => {
    store().setActiveSession('b-w1');
    store().reconcileArchitectSessions('a', [rec('a-arch', 'a', 'architect')]);
    expect(Object.keys(store().sessions).sort()).toEqual(['a-arch', 'b-arch', 'b-w1']);
    expect(store().activeSessionId).toBe('b-w1');
  });

  it('falls back within the project when the shown session ends', () => {
    store().setActiveSession('a-w1');
    store().unregisterSession('a-w1');
    expect(store().selectedArchitectKey).toBe('a');
    expect(store().activeSessionId).toBe('a-arch');
  });

  it('keeps an architect’s workers and other projects when the architect ends', () => {
    store().setActiveSession('a-arch');
    store().unregisterSession('a-arch');
    expect(store().selectedArchitectKey).toBe('a');
    expect(store().activeSessionId).toBe('a-w1');
    expect(store().sessions['b-arch']).toBeDefined();
    store().unregisterSession('a-w1');
    expect(store().selectedArchitectKey).toBe('a');
    expect(store().activeSessionId).toBeNull();
  });

  it('counts explicit selections only', () => {
    const before = store().selectionEpoch;
    store().reconcileArchitectSessions('a', [rec('a-arch', 'a', 'architect')]);
    expect(store().selectionEpoch).toBe(before);
    store().selectArchitect('b');
    store().setActiveSession('b-w1');
    expect(store().selectionEpoch).toBe(before + 2);
  });

  it('rejects a snapshot carrying another project’s session', () => {
    expect(() => store().reconcileArchitectSessions('a', [rec('b-x', 'b', 'ticket')])).toThrow();
  });
});
