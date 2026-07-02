import { joinPath, sortEntries } from './DirTree';
import styles from './DirTree.module.css';
import EntryRow from './EntryRow';
import { useDirListing } from './useDirListing';

interface Props {
  path: string;
  refreshSeq: number;
  onOpenFile(path: string): void;
  onEnterDir(path: string): void;
}

// Flat one-directory listing for the narrow drill-down mode. Same rows and
// fetch hook as the tree, recomposed without nesting.
export default function DirListing({ path, refreshSeq, onOpenFile, onEnterDir }: Props) {
  const { data, loading, error } = useDirListing(path, refreshSeq);

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
          <EntryRow
            key={entry.name}
            entry={entry}
            onClick={() => {
              if (entry.kind === 'dir') onEnterDir(entryPath);
              else if (entry.kind === 'file') onOpenFile(entryPath);
            }}
          />
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
