import { useEffect, useRef, useState } from 'react';
import type { FsSearchResponse } from '../../../../../../shared/types';

export interface FileSearchState {
  data: FsSearchResponse | null;
  loading: boolean;
  error: unknown | null;
}

const DEBOUNCE_MS = 120;

// Debounced daemon filename search under `root`. An empty root or query
// idles the hook (clears state, no request). Previous results stay visible
// while the next query is in flight so the list doesn't flash on every
// keystroke; a sequence guard drops out-of-order responses so fast typing
// can't paint stale results over fresh ones.
export function useFileSearch(root: string, query: string): FileSearchState {
  const [state, setState] = useState<FileSearchState>({ data: null, loading: false, error: null });
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    if (!root || !query) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const timer = window.setTimeout(() => {
      window.hiveryn.fs.search(root, query).then(
        (data) => {
          if (seqRef.current === seq) setState({ data, loading: false, error: null });
        },
        (err) => {
          if (seqRef.current === seq) setState({ data: null, loading: false, error: err });
        },
      );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [root, query]);

  return state;
}
