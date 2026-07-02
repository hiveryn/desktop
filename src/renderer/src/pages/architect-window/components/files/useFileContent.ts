import { useEffect, useState } from 'react';
import type { FsFileResponse } from '../../../../../../shared/types';

export interface FileContentState {
  data: FsFileResponse | null;
  loading: boolean;
  error: unknown | null;
}

// Fetches raw file bytes + sniffed metadata. Pass null to skip.
// refreshSeq is a trigger dep: bumping it refetches the same path.
export function useFileContent(path: string | null, refreshSeq = 0): FileContentState {
  const [state, setState] = useState<FileContentState>({ data: null, loading: false, error: null });

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshSeq is a trigger dep, not read inside the effect
  useEffect(() => {
    if (path === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    window.hiveryn.fs.readFile(path).then(
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
