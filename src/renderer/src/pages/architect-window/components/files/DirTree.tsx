import type { FsEntry } from '../../../../../../shared/types';
import styles from './DirTree.module.css';
import EntryRow from './EntryRow';
import { useDirListing } from './useDirListing';

export function sortEntries(entries: FsEntry[]): FsEntry[] {
  return [...entries].sort((a, b) => {
    const aDir = a.kind === 'dir' ? 0 : 1;
    const bDir = b.kind === 'dir' ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name);
  });
}

export function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

interface DirTreeProps {
  rootPath: string;
  expandedDirs: string[];
  selectedPath: string | null;
  refreshSeq: number;
  onOpenFile(path: string): void;
  onToggleDir(path: string): void;
}

// Lazy tree sidebar: each expanded level is its own DirLevel with its own
// one-level fetch; collapsing unmounts children, so re-expanding refetches.
export default function DirTree(props: DirTreeProps) {
  return (
    <div className={styles.tree}>
      <DirLevel path={props.rootPath} depth={0} {...props} />
    </div>
  );
}

interface DirLevelProps extends DirTreeProps {
  path: string;
  depth: number;
}

function DirLevel({
  path,
  depth,
  rootPath,
  expandedDirs,
  selectedPath,
  refreshSeq,
  onOpenFile,
  onToggleDir,
}: DirLevelProps) {
  const { data, loading, error } = useDirListing(path, refreshSeq);

  if (error) {
    return <div className={styles.levelMessage}>Failed to load directory — see error center</div>;
  }
  if (!data) {
    return loading ? <div className={styles.levelMessage}>Loading…</div> : null;
  }

  return (
    <>
      {sortEntries(data.entries).map((entry) => {
        const entryPath = joinPath(path, entry.name);
        if (entry.kind === 'dir') {
          const expanded = expandedDirs.includes(entryPath);
          return (
            <div key={entry.name}>
              <EntryRow
                entry={entry}
                depth={depth}
                expanded={expanded}
                onClick={() => onToggleDir(entryPath)}
              />
              {expanded && (
                <DirLevel
                  path={entryPath}
                  depth={depth + 1}
                  rootPath={rootPath}
                  expandedDirs={expandedDirs}
                  selectedPath={selectedPath}
                  refreshSeq={refreshSeq}
                  onOpenFile={onOpenFile}
                  onToggleDir={onToggleDir}
                />
              )}
            </div>
          );
        }
        return (
          <EntryRow
            key={entry.name}
            entry={entry}
            depth={depth}
            selected={entry.kind === 'file' && selectedPath === entryPath}
            onClick={() => {
              if (entry.kind === 'file') onOpenFile(entryPath);
            }}
          />
        );
      })}
      {data.truncated && (
        <div className={styles.levelMessage}>
          Showing {data.entries.length} of {data.total} entries
        </div>
      )}
    </>
  );
}
