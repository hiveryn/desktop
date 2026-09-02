import { beforeEach, describe, expect, it } from 'vitest';
import { useRoadmapStore } from './roadmapStore';

const initial = useRoadmapStore.getState();

beforeEach(() => {
  useRoadmapStore.setState(initial, true);
});

describe('roadmapStore', () => {
  it('defaults to the current view with nothing selected', () => {
    const s = useRoadmapStore.getState();
    expect(s.view).toBe('current');
    expect(s.selectedItemId).toBeNull();
    expect(s.selectedArchiveRootId).toBeNull();
  });

  it('switching view clears both selections, since current/archive are different item spaces', () => {
    useRoadmapStore.getState().setSelectedItemId('some-item');
    useRoadmapStore.getState().setSelectedArchiveRootId('some-root');
    useRoadmapStore.getState().setView('archive');

    const s = useRoadmapStore.getState();
    expect(s.view).toBe('archive');
    expect(s.selectedItemId).toBeNull();
    expect(s.selectedArchiveRootId).toBeNull();
  });

  it('selecting an archive root clears any item selection from the previous drill level', () => {
    useRoadmapStore.getState().setSelectedItemId('leftover-item');
    useRoadmapStore.getState().setSelectedArchiveRootId('root-1');

    const s = useRoadmapStore.getState();
    expect(s.selectedArchiveRootId).toBe('root-1');
    expect(s.selectedItemId).toBeNull();
  });

  it('toggleCollapsed flips membership without touching unrelated ids', () => {
    useRoadmapStore.getState().toggleCollapsed('a');
    useRoadmapStore.getState().toggleCollapsed('b');
    expect([...useRoadmapStore.getState().collapsedIds].sort()).toEqual(['a', 'b']);

    useRoadmapStore.getState().toggleCollapsed('a');
    expect([...useRoadmapStore.getState().collapsedIds]).toEqual(['b']);
  });
});
