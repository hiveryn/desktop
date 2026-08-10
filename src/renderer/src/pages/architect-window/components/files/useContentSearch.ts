import { useEffect, useRef, useState } from 'react';
import type { FsContentSearchMatch, FsContentSearchResponse } from '../../../../../../shared/types';

export interface ContentSearchState {
  data: FsContentSearchResponse | null;
  loading: boolean;
  error: unknown | null;
}

// Content search fires on whole words being typed, so debounce a bit longer
// than the filename search — every request greps the working tree.
const DEBOUNCE_MS = 250;
// Sub-2-char queries match half the repo; don't bother the daemon with them.
const MIN_QUERY_LENGTH = 2;

/** Matches normalized to a non-null array (Go sends null for no matches). */
export function contentMatches(data: FsContentSearchResponse | null): FsContentSearchMatch[] {
  return data?.matches ?? [];
}

// Debounced daemon content (grep) search under `root`. Mirrors useFileSearch:
// empty root/query idles the hook, previous results stay visible while the
// next query is in flight, and a sequence guard drops out-of-order responses.
export function useContentSearch(root: string, query: string): ContentSearchState {
  const [state, setState] = useState<ContentSearchState>({
    data: null,
    loading: false,
    error: null,
  });
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    if (!root || query.length < MIN_QUERY_LENGTH) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const timer = window.setTimeout(() => {
      window.hiveryn.fs.searchContent(root, query).then(
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
