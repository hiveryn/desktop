import { useEffect, useState } from 'react';
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshSeq is a trigger dep, not read inside the effect
  useEffect(() => {
    if (path === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
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
