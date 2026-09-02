import type { RoadmapArchiveEntrySummary } from '@hiveryn/shared/domain';
import styles from './RoadmapArchiveList.module.css';

interface Props {
  entries: RoadmapArchiveEntrySummary[];
  selectedRootId: string | null;
  cursorKey: string | null;
  onSelect(rootId: string): void;
  setRowRef?(key: string, node: HTMLElement | null): void;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function RoadmapArchiveList({
  entries,
  selectedRootId,
  cursorKey,
  onSelect,
  setRowRef,
}: Props) {
  if (entries.length === 0) {
    return <div className={styles.empty}>Archive is empty.</div>;
  }

  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.root_id}>
          <button
            type="button"
            ref={(el) => setRowRef?.(entry.root_id, el)}
            className={styles.row}
            data-selected={entry.root_id === selectedRootId || undefined}
            data-cursor={cursorKey === entry.root_id || undefined}
            onClick={() => onSelect(entry.root_id)}
          >
            <span className={styles.kindChar} title={entry.root_kind}>
              {entry.root_kind[0].toUpperCase()}
            </span>
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>{entry.root_title}</span>
              <span className={styles.rowMeta}>
                archived {fmt(entry.archived_at)} · {entry.item_count} item
                {entry.item_count === 1 ? '' : 's'}
              </span>
              {entry.summary && <span className={styles.rowSummary}>{entry.summary}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
