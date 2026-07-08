import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * True once every reachable directory has a settled listing (data or
   * error). False from the very render an expansion makes new dirs
   * reachable — before their fetches are even marked — which is what lets
   * the cursor re-clamp reliably wait out `rows` that are still growing.
   */
  settled: boolean;
  /** Drop one directory's cached state (typically a failed load) and refetch it. */
  retry(path: string): void;
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
  // Bumped by retry() so the fetch effect re-runs after a node is evicted.
  const [retrySeq, setRetrySeq] = useState(0);

  // Fetch bookkeeping lives in refs, NOT in `nodes`. The state map cannot be
  // trusted for "what has been requested": reading it via a setNodes updater
  // is timing-dependent (React only invokes updaters synchronously when the
  // update queue is empty — with a reset queued in the same flush, the
  // updater runs later at render time and the effect would see nothing to
  // fetch), and depending on `nodes` directly would re-trigger the effect on
  // every result. `requested` is the set of paths with a fetch issued (in
  // flight or settled) for the current generation; `generation` invalidates
  // in-flight results on root change / refresh — the ONLY events that make a
  // result stale, since results are keyed by absolute path. There is no
  // per-effect-run cancellation: a fetch issued for the current generation
  // always lands, even if its dir was collapsed meanwhile (the cache
  // deliberately survives collapse).
  const requestedRef = useRef<Set<string>>(new Set());
  const generationRef = useRef(0);

  const retry = useCallback((path: string) => {
    requestedRef.current.delete(path);
    setNodes((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
    setRetrySeq((seq) => seq + 1);
  }, []);

  const reachable = useMemo(() => {
    if (!rootPath) return [];
    const expandedSet = new Set(expandedDirs);
    const paths = [rootPath];
    for (const dir of expandedDirs) {
      if (dir !== rootPath && isReachable(dir, rootPath, expandedSet)) paths.push(dir);
    }
    return paths;
  }, [rootPath, expandedDirs]);

  // Declared before the fetch effect: effects run in order, so on a root
  // change / refresh the generation bumps and the caches clear before the
  // fetch effect (re-)issues requests for the new generation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rootPath/refreshSeq are trigger deps, not read inside the effect
  useEffect(() => {
    generationRef.current += 1;
    requestedRef.current = new Set();
    setNodes(new Map());
  }, [rootPath, refreshSeq]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshSeq/retrySeq are trigger deps (drive refetch after the reset/retry clears the bookkeeping), not read inside the effect
  useEffect(() => {
    const generation = generationRef.current;
    const requested = requestedRef.current;
    const missing = reachable.filter((path) => !requested.has(path));
    if (missing.length === 0) return;
    for (const path of missing) requested.add(path);
    setNodes((prev) => {
      const next = new Map(prev);
      for (const path of missing) next.set(path, { data: null, loading: true, error: null });
      return next;
    });
    for (const path of missing) {
      window.hiveryn.fs.listDir(path).then(
        (data) => {
          if (generationRef.current !== generation) return;
          setNodes((prev) => new Map(prev).set(path, { data, loading: false, error: null }));
        },
        (err) => {
          if (generationRef.current !== generation) return;
          setNodes((prev) => new Map(prev).set(path, { data: null, loading: false, error: err }));
        },
      );
    }
  }, [reachable, refreshSeq, retrySeq]);

  const settled = useMemo(
    () =>
      reachable.every((path) => {
        const node = nodes.get(path);
        return node !== undefined && !node.loading;
      }),
    [reachable, nodes],
  );

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

  return { rows, nodes, settled, retry };
}
