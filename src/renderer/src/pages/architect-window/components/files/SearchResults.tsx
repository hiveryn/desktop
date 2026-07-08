import { useEffect, useRef } from 'react';
import type { FsSearchResponse } from '../../../../../../shared/types';
import styles from './SearchResults.module.css';

interface Props {
  search: { data: FsSearchResponse | null; loading: boolean; error: unknown | null };
  selectedIndex: number;
  onHover(index: number): void;
  onOpen(relPath: string): void;
}

function splitMatch(relPath: string): { dir: string; base: string } {
  const idx = relPath.lastIndexOf('/');
  return idx === -1
    ? { dir: '', base: relPath }
    : { dir: relPath.slice(0, idx + 1), base: relPath.slice(idx + 1) };
}

// Ranked filename matches for the "/" search. Selection is keyboard-driven
// from the search input (FilesPane owns the index); rows still respond to
// mouse hover/click so the two interaction modes never diverge.
export default function SearchResults({ search, selectedIndex, onHover, onOpen }: Props) {
  const rowRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    rowRefs.current.get(selectedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (search.error) {
    return (
      <div className={styles.message}>
        Search failed: {search.error instanceof Error ? search.error.message : String(search.error)}
      </div>
    );
  }
  if (!search.data) {
    return search.loading ? <div className={styles.message}>Searching…</div> : null;
  }

  const { matches, total, truncated } = search.data;
  return (
    <div className={styles.results}>
      {matches.length === 0 && <div className={styles.message}>No matches</div>}
      {matches.map((match, i) => {
        const { dir, base } = splitMatch(match.path);
        return (
          <button
            key={match.path}
            type="button"
            ref={(el) => {
              if (el) rowRefs.current.set(i, el);
              else rowRefs.current.delete(i);
            }}
            className={styles.row}
            data-selected={i === selectedIndex || undefined}
            onMouseMove={() => onHover(i)}
            onClick={() => onOpen(match.path)}
          >
            <span className={styles.base}>{base}</span>
            {dir !== '' && <span className={styles.dir}>{dir}</span>}
          </button>
        );
      })}
      {matches.length < total && (
        <div className={styles.message}>
          Showing {matches.length} of {total} matches
        </div>
      )}
      {truncated && <div className={styles.message}>Search stopped early — too many files</div>}
    </div>
  );
}
