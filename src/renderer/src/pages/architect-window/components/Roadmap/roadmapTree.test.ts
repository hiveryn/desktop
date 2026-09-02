import type { RoadmapItem } from '@hiveryn/shared/domain';
import { describe, expect, it } from 'vitest';
import { buildRoadmapTree, childrenOfItem, flattenRoadmapTree } from './roadmapTree';

function item(overrides: Partial<RoadmapItem> & Pick<RoadmapItem, 'id'>): RoadmapItem {
  return {
    kind: 'goal',
    title: overrides.id,
    status: 'planned',
    outcome: 'outcome',
    parent_id: null,
    order: 10,
    success_criteria: [],
    tickets: [],
    depends_on: [],
    ...overrides,
  };
}

describe('buildRoadmapTree / flattenRoadmapTree', () => {
  it('nests items by parent_id and orders siblings deterministically by order', () => {
    const items = [
      item({ id: 'goal-a', order: 20 }),
      item({ id: 'goal-b', order: 10 }),
      item({ id: 'child-of-a-2', parent_id: 'goal-a', order: 20 }),
      item({ id: 'child-of-a-1', parent_id: 'goal-a', order: 10 }),
    ];

    const tree = buildRoadmapTree(items);

    expect(tree.map((n) => n.item.id)).toEqual(['goal-b', 'goal-a']);
    const goalA = tree.find((n) => n.item.id === 'goal-a');
    expect(goalA?.children.map((n) => n.item.id)).toEqual(['child-of-a-1', 'child-of-a-2']);
  });

  it('breaks tied order with a stable id comparison', () => {
    const items = [item({ id: 'b', order: 10 }), item({ id: 'a', order: 10 })];
    const tree = buildRoadmapTree(items);
    expect(tree.map((n) => n.item.id)).toEqual(['a', 'b']);
  });

  it('treats an item whose parent is missing from the set as a root instead of dropping it', () => {
    const items = [item({ id: 'orphan', parent_id: 'not-in-set', order: 10 })];
    const tree = buildRoadmapTree(items);
    expect(tree.map((n) => n.item.id)).toEqual(['orphan']);
  });

  it('flattens depth-first with collapse hiding descendants only', () => {
    const items = [
      item({ id: 'root', order: 10 }),
      item({ id: 'mid', parent_id: 'root', order: 10 }),
      item({ id: 'leaf', parent_id: 'mid', order: 10 }),
    ];
    const tree = buildRoadmapTree(items);

    const expanded = flattenRoadmapTree(tree, new Set());
    expect(expanded.map((r) => [r.key, r.depth])).toEqual([
      ['root', 0],
      ['mid', 1],
      ['leaf', 2],
    ]);

    const collapsed = flattenRoadmapTree(tree, new Set(['mid']));
    expect(collapsed.map((r) => r.key)).toEqual(['root', 'mid']);
  });

  it('handles an archive entry snapshot the same way current items are handled (root parent_id null)', () => {
    const items = [
      item({ id: 'archived-root', parent_id: null, order: 10 }),
      item({ id: 'archived-child', parent_id: 'archived-root', order: 10 }),
    ];
    const tree = buildRoadmapTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].item.id).toBe('archived-root');
    expect(tree[0].children.map((n) => n.item.id)).toEqual(['archived-child']);
  });
});

describe('childrenOfItem', () => {
  it('returns only direct children, ordered', () => {
    const items = [
      item({ id: 'root', order: 10 }),
      item({ id: 'grandchild', parent_id: 'child', order: 10 }),
      item({ id: 'child-2', parent_id: 'root', order: 20 }),
      item({ id: 'child-1', parent_id: 'root', order: 10 }),
    ];
    expect(childrenOfItem(items, 'root').map((i) => i.id)).toEqual(['child-1', 'child-2']);
  });

  it('returns an empty array for a leaf item', () => {
    const items = [item({ id: 'leaf', order: 10 })];
    expect(childrenOfItem(items, 'leaf')).toEqual([]);
  });
});
