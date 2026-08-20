import { DiffView } from '@components';
import type { DiffViewFile, DiffViewSection } from '@components';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RepoCommitDiffResponse, RepoDiffFile } from '../../../../shared/types';
import { CommitRequestLifecycle, type ConclusionCommit } from './commitChangesModel';
import styles from './TicketDetail.module.css';

interface Props {
  architectKey: string;
  commits: ConclusionCommit[];
}

interface LoadState {
  data: RepoCommitDiffResponse | null;
  loading: boolean;
  error: unknown;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

function toDiffViewFile(file: RepoDiffFile): DiffViewFile {
  const sections: DiffViewSection[] = file.sections?.length
    ? file.sections.map((section) => ({
        kind: section.kind,
        rawUnifiedDiff: section.raw_unified_diff ?? '',
        isBinary: section.is_binary,
        additions: section.additions,
        deletions: section.deletions,
        rawDiffBytes: section.raw_diff_bytes,
        truncated: section.truncated ?? false,
      }))
    : [{
        kind: 'combined',
        rawUnifiedDiff: file.raw_unified_diff ?? '',
        isBinary: file.is_binary,
        additions: file.additions,
        deletions: file.deletions,
        rawDiffBytes: file.raw_diff_bytes,
        truncated: file.truncated ?? false,
      }];
  return { path: file.path, oldPath: file.old_path, status: file.status, sections };
}

export function CommitChanges({ architectKey, commits }: Props) {
  const [selectedKey, setSelectedKey] = useState(commits[0]?.key ?? '');
  const selected = commits.find((commit) => commit.key === selectedKey) ?? commits[0];
  const [states, setStates] = useState<Record<string, LoadState>>({});
  const statesRef = useRef(states);
  statesRef.current = states;
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const lifecycle = useRef(new CommitRequestLifecycle());

  useEffect(() => {
    setSelectedKey(commits[0]?.key ?? '');
    setStates({});
    setSelectedPath(null);
  }, [commits]);

  useEffect(() => {
    if (!selected) return;
    const generation = lifecycle.current.select(selected.key);
    setSelectedPath(null);
    if (selected.error || statesRef.current[selected.key]?.data || statesRef.current[selected.key]?.loading) return;
    if (!selected.repo || !selected.sha) return;

    setStates((current) => ({
      ...current,
      [selected.key]: { data: null, loading: true, error: null },
    }));
    void window.hiveryn.repos.commitDiff(architectKey, selected.repo, selected.sha).then(
      (data) => {
        if (!lifecycle.current.owns(selected.key, generation)) return;
        setStates((current) => ({
          ...current,
          [selected.key]: { data, loading: false, error: null },
        }));
      },
      (error) => {
        if (!lifecycle.current.owns(selected.key, generation)) return;
        setStates((current) => ({
          ...current,
          [selected.key]: { data: null, loading: false, error },
        }));
      },
    );
  }, [architectKey, selected, retryGeneration]);

  const state = selected ? states[selected.key] : undefined;
  const selectedFile = useMemo(
    () => state?.data?.files.find((file) => file.path === selectedPath) ?? state?.data?.files[0] ?? null,
    [selectedPath, state?.data],
  );

  if (!selected) return null;

  return (
    <div className={styles.changes}>
      <div className={styles.commitHeader}>
        <label className={styles.commitLabel} htmlFor="ticket-commit-select">Repository and commit</label>
        <select
          id="ticket-commit-select"
          className={styles.commitSelect}
          value={selected.key}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          {commits.map((commit) => <option key={commit.key} value={commit.key}>{commit.label}</option>)}
        </select>
        <code className={styles.commitTrace} title={selected.trace}>{selected.trace}</code>
      </div>

      {selected.error ? <pre className={styles.commitError}>{selected.error}</pre> : null}
      {state?.loading ? <div className={styles.commitState}>Loading {selected.trace}…</div> : null}
      {state?.error ? (
        <div className={styles.commitError}>
          <pre>Failed to load {selected.trace}{'\n'}{errorText(state.error)}</pre>
          <button type="button" onClick={() => setRetryGeneration((value) => value + 1)}>Retry</button>
        </div>
      ) : null}
      {state?.data && state.data.files.length === 0 ? (
        <div className={styles.commitState}>No file changes in {selected.trace}.</div>
      ) : null}
      {state?.data && state.data.files.length > 0 ? (
        <>
          <div className={styles.diffSummary}>
            {state.data.summary.files} files · <span data-kind="additions">+{state.data.summary.additions}</span> ·{' '}
            <span data-kind="deletions">−{state.data.summary.deletions}</span>
          </div>
          <div className={styles.commitDiffLayout}>
            <nav className={styles.commitFiles} aria-label="Changed files">
              {state.data.files.map((file) => (
                <button
                  type="button"
                  key={file.path}
                  className={styles.commitFile}
                  data-selected={file.path === selectedFile?.path || undefined}
                  onClick={() => setSelectedPath(file.path)}
                >
                  <span data-status={file.status}>{file.status === 'new' ? 'A' : file.status === 'deleted' ? 'D' : file.status === 'renamed' ? 'R' : file.status === 'copied' ? 'C' : file.status === 'untracked' ? '?' : 'M'}</span>
                  <span>{file.path}</span>
                </button>
              ))}
            </nav>
            <div className={styles.commitDiff}>
              {selectedFile ? <DiffView key={selectedFile.path} file={toDiffViewFile(selectedFile)} /> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
