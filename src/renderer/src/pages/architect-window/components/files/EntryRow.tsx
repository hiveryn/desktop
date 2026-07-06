import type { FsEntry } from '../../../../../../shared/types';
import styles from './EntryRow.module.css';

interface Props {
  entry: FsEntry;
  selected?: boolean;
  // Vim-style keyboard cursor row; visually distinct from `selected` (the
  // open file) since a cursor can sit on a directory, which is never selected.
  cursor?: boolean;
  expanded?: boolean;
  // Tree indent depth; 0 for flat listings.
  depth?: number;
  onClick(): void;
}

const KIND_GLYPHS: Record<FsEntry['kind'], string> = {
  dir: '▸',
  file: ' ',
  symlink: '⇢',
  other: '?',
};

export default function EntryRow({ entry, selected, cursor, expanded, depth = 0, onClick }: Props) {
  const glyph = entry.kind === 'dir' && expanded ? '▾' : KIND_GLYPHS[entry.kind];
  return (
    <button
      type="button"
      className={styles.row}
      data-selected={selected || undefined}
      data-cursor={cursor || undefined}
      data-ignored={entry.ignored || undefined}
      data-kind={entry.kind}
      style={{ paddingLeft: `calc(var(--space-h-2) + ${depth} * 2ch)` }}
      onClick={onClick}
    >
      <span className={styles.glyph} aria-hidden="true">
        {glyph}
      </span>
      <span className={styles.name}>{entry.name}</span>
    </button>
  );
}
