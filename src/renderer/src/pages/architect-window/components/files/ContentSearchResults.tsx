import { Fragment, useEffect, useRef } from 'react';
import styles from './ContentSearchResults.module.css';
import { type ContentSearchState, contentMatches } from './useContentSearch';

interface Props {
  search: ContentSearchState;
  /** Index into the flat match list (one entry per matched line). */
  selectedIndex: number;
  onHover(index: number): void;
  onOpen(relPath: string, line: number): void;
}

// Grep results grouped by file: a path heading, then one row per matched
// line. Selection walks the flat match list (FilesPane owns the index) so
// keyboard navigation from the search input just works across groups.
export default function ContentSearchResults({ search, selectedIndex, onHover, onOpen }: Props) {
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

  const matches = contentMatches(search.data);
  let lastPath: string | null = null;

  return (
    <div className={styles.results}>
      {matches.length === 0 && <div className={styles.message}>No matches</div>}
      {matches.map((match, i) => {
        const isNewFile = match.path !== lastPath;
        lastPath = match.path;
        return (
          // git grep reports each matched line once, so path:line is unique.
          <Fragment key={`${match.path}:${match.line}`}>
            {isNewFile && <div className={styles.fileHeading}>{match.path}</div>}
            <button
              type="button"
              ref={(el) => {
                if (el) rowRefs.current.set(i, el);
                else rowRefs.current.delete(i);
              }}
              className={styles.row}
              data-selected={i === selectedIndex || undefined}
              onMouseMove={() => onHover(i)}
              onClick={() => onOpen(match.path, match.line)}
            >
              <span className={styles.lineNo}>{match.line}</span>
              <span className={styles.text}>{match.text.trim() || ' '}</span>
            </button>
          </Fragment>
        );
      })}
      {search.data.truncated && (
        <div className={styles.message}>More matches exist — narrow the query</div>
      )}
    </div>
  );
}
