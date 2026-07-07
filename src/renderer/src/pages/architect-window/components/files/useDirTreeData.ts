import { useEffect, useMemo, useState } from 'react';
import type { FsEntry, FsTreeResponse } from '../../../../../../shared/types';
import { joinPath, sortEntries } from './dirTreeUtils';

export interface DirNodeState {
  data: FsTreeResponse | null;
  loading: boolean;
  error: unknown | null;
}

export interface VisibleRow {
  path: string;
  entry: FsEntry;
  depth: number;
  expanded: boolean;
}

export interface DirTreeData {
  rows: VisibleRow[];
  nodes: Map<string, DirNodeState>;
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

// A path is reachable if every ancestor between it and rootPath (exclusive
// of rootPath itself) is expanded — computed purely from path strings, so it
// doesn't depend on fetch order or which levels have already loaded. This is
// what lets expandedDirs safely contain stale entries left over from a
// collapsed ancestor without them being fetched or rendered.
function isReachable(path: string, rootPath: string, expandedSet: Set<string>): boolean {
  if (path === rootPath) return true;
  let current = parentOf(path);
  while (current !== rootPath) {
    if (!expandedSet.has(current)) return false;
    const next = parentOf(current);
    if (next === current) return false;
    current = next;
  }
  return true;
}

// Flattens the lazily-expanded directory tree into a single ordered list of
// visible rows, backed by one shared fetch cache keyed by path. Collapsing a
// directory does not evict its cached listing — re-expanding it is instant —
// only a rootPath change or a refreshSeq bump clears the cache.
export function useDirTreeData(
  rootPath: string,
  expandedDirs: string[],
  refreshSeq: number,
): DirTreeData {
  const [nodes, setNodes] = useState<Map<string, DirNodeState>>(() => new Map());

  const reachable = useMemo(() => {
    if (!rootPath) return [];
    const expandedSet = new Set(expandedDirs);
    const paths = [rootPath];
    for (const dir of expandedDirs) {
      if (dir !== rootPath && isReachable(dir, rootPath, expandedSet)) paths.push(dir);
    }
    return paths;
  }, [rootPath, expandedDirs]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rootPath/refreshSeq are trigger deps, not read inside the effect
  useEffect(() => {
    setNodes(new Map());
  }, [rootPath, refreshSeq]);

  // The fetch effect must NOT depend on `nodes`: it calls setNodes below to
  // mark directories loading, and if `nodes` were a dep that write would tear
  // down this run, flip `cancelled` in cleanup, and drop the in-flight listDir
  // result — leaving the node stuck `{ data: null, loading: true }` forever.
  // Instead compute `missing` inside the functional updater (reading the live
  // map, not a stale closure) and depend only on stable trigger deps. This
  // mirrors useDirListing's [path, refreshSeq] pattern.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshSeq is a trigger dep (drives refetch after the reset effect clears nodes); nodes is read via the setNodes updater, not the closure
  useEffect(() => {
    if (reachable.length === 0) return;
    let cancelled = false;
    let missing: string[] = [];
    setNodes((prev) => {
      missing = reachable.filter((path) => !prev.has(path));
      if (missing.length === 0) return prev;
      const next = new Map(prev);
      for (const path of missing) next.set(path, { data: null, loading: true, error: null });
      return next;
    });
    if (missing.length === 0) return;
    for (const path of missing) {
      window.hiveryn.fs.listDir(path).then(
        (data) => {
          if (cancelled) return;
          setNodes((prev) => new Map(prev).set(path, { data, loading: false, error: null }));
        },
        (err) => {
          if (cancelled) return;
          setNodes((prev) => new Map(prev).set(path, { data: null, loading: false, error: err }));
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [reachable, refreshSeq]);

  const rows = useMemo(() => {
    if (!rootPath) return [];
    const expandedSet = new Set(expandedDirs);
    const result: VisibleRow[] = [];
    const walk = (path: string, depth: number): void => {
      const node = nodes.get(path);
      if (!node?.data) return;
      for (const entry of sortEntries(node.data.entries)) {
        const entryPath = joinPath(path, entry.name);
        const expanded = entry.kind === 'dir' && expandedSet.has(entryPath);
        result.push({ path: entryPath, entry, depth, expanded });
        if (expanded) walk(entryPath, depth + 1);
      }
    };
    walk(rootPath, 0);
    return result;
  }, [rootPath, expandedDirs, nodes]);

  return { rows, nodes };
}
