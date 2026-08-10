import { useMemo } from 'react';
import type { FsEntry } from '../../../../../../shared/types';
import styles from './DirTree.module.css';
import EntryRow from './EntryRow';
import { EMPTY_DECORATIONS, type RowDecorations } from './rowDecorations';
import type { DirNodeState, VisibleRow } from './useDirTreeData';

interface DirTreeProps {
  rootPath: string;
  rows: VisibleRow[];
  nodes: Map<string, DirNodeState>;
  selectedPath: string | null;
  cursorPath: string | null;
  decorations?: RowDecorations;
  onOpenFile(path: string): void;
  onToggleDir(path: string): void;
  onRetry(path: string): void;
  onRowContextMenu?(path: string, entry: FsEntry, position: { x: number; y: number }): void;
  rowRef?(path: string, node: HTMLElement | null): void;
}

type RenderItem =
  | { kind: 'row'; row: VisibleRow }
  | { kind: 'banner'; key: string; message: string; retryPath?: string };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function bannerFor(
  path: string,
  node: DirNodeState | undefined,
): Omit<RenderItem & { kind: 'banner' }, 'kind' | 'key'> | null {
  if (node?.error) {
    return { message: `Failed to load: ${errorText(node.error)}`, retryPath: path };
  }
  if (!node?.data) return node?.loading ? { message: 'Loading…' } : null;
  if (node.data.truncated) {
    return { message: `Showing ${node.data.entries.length} of ${node.data.total} entries` };
  }
  return null;
}

// Interleaves each directory's loading/error/truncated banner right after
// the last row of its subtree (or immediately after its own row, if it has
// no children yet) — matching where the old per-level DirLevel components
// used to render these messages, now computed from the flat row list via a
// depth-based stack instead of component nesting.
function buildRenderItems(
  rootPath: string,
  rows: VisibleRow[],
  nodes: Map<string, DirNodeState>,
): RenderItem[] {
  const items: RenderItem[] = [];
  const stack: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: -1 }];

  const closeTo = (depth: number): void => {
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      const dir = stack.pop();
      if (!dir) break;
      const banner = bannerFor(dir.path, nodes.get(dir.path));
      if (banner) items.push({ kind: 'banner', key: `${dir.path}:banner`, ...banner });
    }
  };

  for (const row of rows) {
    closeTo(row.depth);
    items.push({ kind: 'row', row });
    if (row.expanded) stack.push({ path: row.path, depth: row.depth });
  }
  closeTo(-Infinity);

  return items;
}

// Flat tree sidebar rendered from `rows`/`nodes` — the shared fetch cache
// (useDirTreeData) is owned by FilesPane so the keyboard handler can walk
// the exact same visible-row list this component renders from.
export default function DirTree({
  rootPath,
  rows,
  nodes,
  selectedPath,
  cursorPath,
  decorations = EMPTY_DECORATIONS,
  onOpenFile,
  onToggleDir,
  onRetry,
  onRowContextMenu,
  rowRef,
}: DirTreeProps) {
  const items = useMemo(() => buildRenderItems(rootPath, rows, nodes), [rootPath, rows, nodes]);

  return (
    <div className={styles.tree}>
      {items.map((item) =>
        item.kind === 'banner' ? (
          <div key={item.key} className={styles.levelMessage}>
            {item.message}
            {item.retryPath !== undefined && (
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => {
                  if (item.retryPath !== undefined) onRetry(item.retryPath);
                }}
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <div key={item.row.path} ref={(el) => rowRef?.(item.row.path, el)}>
            <EntryRow
              entry={item.row.entry}
              depth={item.row.depth}
              expanded={item.row.entry.kind === 'dir' ? item.row.expanded : undefined}
              selected={item.row.entry.kind === 'file' && selectedPath === item.row.path}
              cursor={cursorPath === item.row.path}
              decoration={decorations.get(item.row.path)}
              onClick={() => {
                if (item.row.entry.kind === 'dir') onToggleDir(item.row.path);
                else onOpenFile(item.row.path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onRowContextMenu?.(item.row.path, item.row.entry, { x: e.clientX, y: e.clientY });
              }}
            />
          </div>
        ),
      )}
    </div>
  );
}
