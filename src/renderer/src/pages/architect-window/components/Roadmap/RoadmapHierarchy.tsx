import type { MouseEvent as ReactMouseEvent } from 'react';
import styles from './RoadmapHierarchy.module.css';
import type { RoadmapTreeRow } from './roadmapTree';

const KIND_CHAR: Record<string, string> = { goal: 'G', initiative: 'I', milestone: 'M' };

interface Props {
  rows: RoadmapTreeRow[];
  cursorKey: string | null;
  selectedId: string | null;
  onToggle(id: string): void;
  onSelect(id: string): void;
  setRowRef?(key: string, node: HTMLElement | null): void;
}

// Renders one flattened RoadmapTreeRow[] level (buildRoadmapTree +
// flattenRoadmapTree in roadmapTree.ts) as a collapsible hierarchy — used for
// both the current roadmap and one archive entry's stored subtree.
export default function RoadmapHierarchy({
  rows,
  cursorKey,
  selectedId,
  onToggle,
  onSelect,
  setRowRef,
}: Props) {
  if (rows.length === 0) {
    return <div className={styles.empty}>No roadmap items.</div>;
  }

  const handleGlyphClick = (e: ReactMouseEvent<HTMLSpanElement>, id: string): void => {
    e.stopPropagation();
    onToggle(id);
  };

  return (
    <div className={styles.tree} role="tree">
      {rows.map((row) => {
        const { item, children } = row.node;
        const hasChildren = children.length > 0;
        return (
          <button
            key={row.key}
            type="button"
            ref={(el) => setRowRef?.(row.key, el)}
            className={styles.row}
            role="treeitem"
            aria-expanded={hasChildren ? row.expanded : undefined}
            aria-selected={item.id === selectedId}
            data-cursor={cursorKey === row.key || undefined}
            data-selected={item.id === selectedId || undefined}
            data-status={item.status}
            style={{ paddingLeft: `calc(var(--space-h-2) + ${row.depth} * 2ch)` }}
            onClick={() => onSelect(item.id)}
          >
            <span
              className={styles.glyph}
              aria-hidden="true"
              onClick={hasChildren ? (e) => handleGlyphClick(e, item.id) : undefined}
            >
              {hasChildren ? (row.expanded ? '▾' : '▸') : ' '}
            </span>
            <span className={styles.kindChar} data-kind={item.kind} title={item.kind}>
              {KIND_CHAR[item.kind]}
            </span>
            <span className={styles.title} title={item.title}>
              {item.title}
            </span>
            <span className={styles.statusDot} data-status={item.status} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
