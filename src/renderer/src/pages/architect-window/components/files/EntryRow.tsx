import type { MouseEvent } from 'react';
import type { FsEntry } from '../../../../../../shared/types';
import styles from './EntryRow.module.css';
import type { RowDecoration } from './rowDecorations';

interface Props {
  entry: FsEntry;
  selected?: boolean;
  // Vim-style keyboard cursor row; visually distinct from `selected` (the
  // open file) since a cursor can sit on a directory, which is never selected.
  cursor?: boolean;
  expanded?: boolean;
  // Tree indent depth; 0 for flat listings.
  depth?: number;
  decoration?: RowDecoration;
  onClick(): void;
  onContextMenu?(e: MouseEvent): void;
}

const KIND_GLYPHS: Record<FsEntry['kind'], string> = {
  dir: '▸',
  file: ' ',
  symlink: '⇢',
  other: '?',
};

// How long the agent-touched dot stays visible; must match the CSS fade
// animation duration on .touchedDot.
export const TOUCHED_TTL_MS = 60_000;

export default function EntryRow({
  entry,
  selected,
  cursor,
  expanded,
  depth = 0,
  decoration,
  onClick,
  onContextMenu,
}: Props) {
  const glyph = entry.kind === 'dir' && expanded ? '▾' : KIND_GLYPHS[entry.kind];
  return (
    <button
      type="button"
      className={styles.row}
      data-selected={selected || undefined}
      data-cursor={cursor || undefined}
      data-ignored={entry.ignored || undefined}
      data-kind={entry.kind}
      data-status={decoration?.status}
      style={{ paddingLeft: `calc(var(--space-h-2) + ${depth} * 2ch)` }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className={styles.glyph} aria-hidden="true">
        {glyph}
      </span>
      <span className={styles.name}>{entry.name}</span>
      {(decoration?.dirty ||
        decoration?.touchedAt !== undefined ||
        decoration?.status ||
        decoration?.statusDir) && (
        <span className={styles.markers} aria-hidden="true">
          {decoration.dirty && (
            <span className={styles.dirtyDot} title="Unsaved edits">
              ●
            </span>
          )}
          {decoration.touchedAt !== undefined && (
            // Keyed by timestamp so a re-touch restarts the fade animation.
            <span key={decoration.touchedAt} className={styles.touchedDot} title="Agent edited" />
          )}
          {decoration.status ? (
            <span className={styles.statusChar} data-status={decoration.status}>
              {decoration.status}
            </span>
          ) : decoration.statusDir ? (
            <span className={styles.statusDirDot} title="Contains changes" />
          ) : null}
        </span>
      )}
    </button>
  );
}
