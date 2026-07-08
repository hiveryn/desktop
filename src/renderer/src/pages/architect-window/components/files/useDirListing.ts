import { useEffect, useRef, useState } from 'react';
import type { FsTreeResponse } from '../../../../../../shared/types';

export interface DirListingState {
  data: FsTreeResponse | null;
  loading: boolean;
  error: unknown | null;
}

// Fetches one directory level. Pass null to skip (renders nothing yet).
// refreshSeq is a trigger dep: bumping it refetches the same path.
export function useDirListing(path: string | null, refreshSeq = 0): DirListingState {
  const [state, setState] = useState<DirListingState>({ data: null, loading: false, error: null });
  const lastPathRef = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshSeq is a trigger dep, not read inside the effect
  useEffect(() => {
    if (path === null) {
      lastPathRef.current = null;
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    // Keep the previous listing visible across a same-path refresh (no
    // flicker), but drop it when the directory changes — stale entries would
    // otherwise render joined against the NEW path until the fetch lands.
    const pathChanged = lastPathRef.current !== path;
    lastPathRef.current = path;
    setState((prev) =>
      pathChanged
        ? { data: null, loading: true, error: null }
        : { ...prev, loading: true, error: null },
    );
    window.hiveryn.fs.listDir(path).then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      },
      (err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, refreshSeq]);

  return state;
}
