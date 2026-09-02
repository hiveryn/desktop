import type { RoadmapItem } from '@hiveryn/shared/domain';

// In-memory tree over a flat RoadmapItem[] (parent_id/order graph), flattened
// to visible rows the same way gitDiffTree.ts does for changed files —
// keyboard nav and rendering both walk one list. Works unchanged for both the
// current roadmap (root parent_id is null) and one archive entry's stored
// subtree (the root's parent_id is null inside the snapshot too).

export interface RoadmapTreeNode {
  item: RoadmapItem;
  children: RoadmapTreeNode[];
}

export interface RoadmapTreeRow {
  key: string;
  depth: number;
  parentKey: string | null;
  node: RoadmapTreeNode;
  expanded: boolean;
}

export function buildRoadmapTree(items: RoadmapItem[]): RoadmapTreeNode[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const childrenOf = new Map<string | null, RoadmapItem[]>();
  for (const item of items) {
    // An item whose parent isn't in this set (a focused/depth-limited read,
    // or malformed data) surfaces as a root rather than being silently
    // dropped — reviewers must always be able to find every returned item.
    const key = item.parent_id !== null && byId.has(item.parent_id) ? item.parent_id : null;
    const list = childrenOf.get(key);
    if (list) list.push(item);
    else childrenOf.set(key, [item]);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  const build = (parentId: string | null): RoadmapTreeNode[] =>
    (childrenOf.get(parentId) ?? []).map((item) => ({ item, children: build(item.id) }));

  return build(null);
}

export function flattenRoadmapTree(
  nodes: RoadmapTreeNode[],
  collapsedIds: ReadonlySet<string>,
): RoadmapTreeRow[] {
  const rows: RoadmapTreeRow[] = [];
  const walk = (children: RoadmapTreeNode[], depth: number, parentKey: string | null): void => {
    for (const node of children) {
      const expanded = !collapsedIds.has(node.item.id);
      rows.push({ key: node.item.id, depth, parentKey, node, expanded });
      if (expanded) walk(node.children, depth + 1, node.item.id);
    }
  };
  walk(nodes, 0, null);
  return rows;
}

/** Direct children of an item within a given item set — used by the detail panel's child summary. */
export function childrenOfItem(items: RoadmapItem[], itemId: string): RoadmapItem[] {
  return items
    .filter((item) => item.parent_id === itemId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
