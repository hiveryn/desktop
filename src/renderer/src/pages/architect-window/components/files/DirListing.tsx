import { useEffect, useRef } from 'react';
import type { FsTreeResponse } from '../../../../../../shared/types';
import styles from './DirTree.module.css';
import { joinPath, sortEntries } from './dirTreeUtils';
import EntryRow from './EntryRow';

interface Props {
  path: string;
  data: FsTreeResponse | null;
  loading: boolean;
  error: unknown | null;
  cursorPath: string | null;
  onOpenFile(path: string): void;
  onEnterDir(path: string): void;
}

// Flat one-directory listing for the narrow drill-down mode. Fetch state is
// owned by FilesPane (lifted up so the keyboard handler can read the same
// sorted entries this component renders, without a second fetch).
export default function DirListing({
  path,
  data,
  loading,
  error,
  cursorPath,
  onOpenFile,
  onEnterDir,
}: Props) {
  const rowRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!cursorPath) return;
    rowRefs.current.get(cursorPath)?.scrollIntoView({ block: 'nearest' });
  }, [cursorPath]);

  if (error) {
    return <div className={styles.levelMessage}>Failed to load directory — see error center</div>;
  }
  if (!data) {
    return loading ? <div className={styles.levelMessage}>Loading…</div> : null;
  }

  return (
    <div className={styles.tree}>
      {sortEntries(data.entries).map((entry) => {
        const entryPath = joinPath(path, entry.name);
        return (
          <div
            key={entry.name}
            ref={(el) => {
              if (el) rowRefs.current.set(entryPath, el);
              else rowRefs.current.delete(entryPath);
            }}
          >
            <EntryRow
              entry={entry}
              cursor={cursorPath === entryPath}
              onClick={() => {
                if (entry.kind === 'dir') onEnterDir(entryPath);
                else if (entry.kind === 'file') onOpenFile(entryPath);
              }}
            />
          </div>
        );
      })}
      {data.truncated && (
        <div className={styles.levelMessage}>
          Showing {data.entries.length} of {data.total} entries
        </div>
      )}
    </div>
  );
}
