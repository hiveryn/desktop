import type { DiffViewFile, DiffViewSection } from '@components';
import { DiffView, GitDiff, IconButton, Refresh } from '@components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RepoDiffFile, RepoDiffResponse } from '../../../../../shared/types';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../keys/matchers';
import { useEventsForActiveSession } from '../../../state/selectors';
import { useSessionStore } from '../../../state/sessionStore';
import styles from './GitDiffPane.module.css';

// Tool names normalized by agentruntime (agentruntime/adapter/*/normalize.go)
// that mutate the working tree. Bash is deliberately excluded — most Bash
// calls (test runs, `ls`, etc.) aren't file mutations and would cause noisy
// over-refetching.
const FILE_MUTATING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'ApplyPatch']);
const REFETCH_DEBOUNCE_MS = 1500;

const STATUS_LABEL: Record<RepoDiffFile['status'], string> = {
  modified: 'modified',
  new: 'new',
  deleted: 'deleted',
  renamed: 'renamed',
  copied: 'copied',
  untracked: 'untracked',
};

function tildePath(path: string, home: string): string {
  if (home && (path === home || path.startsWith(`${home}/`))) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function toDiffViewFile(file: RepoDiffFile): DiffViewFile {
  const sections: DiffViewSection[] =
    file.sections && file.sections.length > 0
      ? file.sections.map((section) => ({
          kind: section.kind,
          rawUnifiedDiff: section.raw_unified_diff ?? '',
          isBinary: section.is_binary,
          additions: section.additions,
          deletions: section.deletions,
          rawDiffBytes: section.raw_diff_bytes,
          truncated: section.truncated ?? false,
        }))
      : [
          {
            kind: 'combined',
            rawUnifiedDiff: file.raw_unified_diff ?? '',
            isBinary: file.is_binary,
            additions: file.additions,
            deletions: file.deletions,
            rawDiffBytes: file.raw_diff_bytes,
            truncated: file.truncated ?? false,
          },
        ];

  return { path: file.path, oldPath: file.old_path, status: file.status, sections };
}

interface Props {
  sessionId: string;
  architectKey: string | undefined;
  isActive: boolean;
  shortcutConfig: ShortcutConfig | null;
}

export default function GitDiffPane({ sessionId, architectKey, isActive, shortcutConfig }: Props) {
  const [home, setHome] = useState('');
  const [repo, setRepo] = useState<string | null | undefined>(undefined); // undefined = unknown yet
  const [data, setData] = useState<RepoDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const diffPaneRef = useRef<HTMLDivElement>(null);
  const fileButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    window.hiveryn.system.getUserHome().then(setHome, () => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRepo(undefined);
    window.hiveryn.sessions.getTicket(sessionId).then(
      (t) => {
        if (!cancelled) setRepo(t.repo ?? null);
      },
      () => {
        if (!cancelled) setRepo(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const refetch = useCallback(async () => {
    if (!architectKey || !repo) return;
    setLoading(true);
    setError(null);
    try {
      const next = await window.hiveryn.repos.diff(architectKey, repo);
      setData(next);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [architectKey, repo]);

  // Refetch whenever the tab becomes active (including first activation).
  useEffect(() => {
    if (isActive) void refetch();
  }, [isActive, refetch]);

  // Debounced refetch on file-mutating tool events, active-tab only.
  const events = useEventsForActiveSession();
  const lastSeenSeqRef = useRef(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const newEvents = events.filter((e) => e.seq > lastSeenSeqRef.current);
    if (newEvents.length === 0) return;
    lastSeenSeqRef.current = events[events.length - 1]?.seq ?? lastSeenSeqRef.current;

    const hasMutation = newEvents.some((e) => e.tool && FILE_MUTATING_TOOLS.has(e.tool));
    if (!hasMutation) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void refetch(), REFETCH_DEBOUNCE_MS);
  }, [events, isActive, refetch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const selectedFile = useMemo(() => {
    if (!data) return null;
    return data.files.find((f) => f.path === selectedPath) ?? data.files[0] ?? null;
  }, [data, selectedPath]);

  useEffect(() => {
    const path = selectedFile?.path;
    if (!path) return;
    fileButtonRefs.current.get(path)?.scrollIntoView({ block: 'nearest' });
  }, [selectedFile?.path]);

  const isGitDiffFocused = useSessionStore((s) => s.focusedPane === 'right-git-diff');
  const shortcutConfigRef = useRef(shortcutConfig);
  shortcutConfigRef.current = shortcutConfig;
  const dataRef = useRef(data);
  dataRef.current = data;
  const selectedFileRef = useRef(selectedFile);
  selectedFileRef.current = selectedFile;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!isGitDiffFocused) return;
    return registerDynamicHandler((e) => {
      const cfg = shortcutConfigRef.current;
      if (!cfg) return 'passthrough';
      if (e.repeat) return 'passthrough';
      if (isTextInputFocused()) return 'passthrough';
      // Modifier-bearing combos belong to global shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return 'passthrough';

      const gitDiffCfg = cfg['git-diff'] ?? {};
      const DOWN = gitDiffCfg.down ?? 'j';
      const UP = gitDiffCfg.up ?? 'k';
      const SCROLL_DOWN = gitDiffCfg['scroll-down'] ?? 'shift+j';
      const SCROLL_UP = gitDiffCfg['scroll-up'] ?? 'shift+k';
      const REFRESH = gitDiffCfg.refresh ?? 'r';

      if (matchesShortcut(e, REFRESH)) {
        void refetchRef.current();
        return 'consumed';
      }
      if (matchesShortcut(e, SCROLL_DOWN)) {
        diffPaneRef.current?.scrollBy({ top: diffPaneRef.current.clientHeight * 0.5 });
        return 'consumed';
      }
      if (matchesShortcut(e, SCROLL_UP)) {
        diffPaneRef.current?.scrollBy({ top: -diffPaneRef.current.clientHeight * 0.5 });
        return 'consumed';
      }

      if (matchesShortcut(e, DOWN) || matchesShortcut(e, UP)) {
        const files = dataRef.current?.files ?? [];
        if (files.length === 0) return 'consumed';
        const idx = files.findIndex((f) => f.path === selectedFileRef.current?.path);
        const delta = matchesShortcut(e, DOWN) ? 1 : -1;
        const nextIdx = idx === -1 ? 0 : (idx + delta + files.length) % files.length;
        setSelectedPath(files[nextIdx].path);
        return 'consumed';
      }

      return 'passthrough';
    });
  }, [isGitDiffFocused]);

  if (repo === null) {
    return (
      <div className={styles.pane}>
        <span className={styles.loading}>No repository associated with this session.</span>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className={styles.pane}>
        <span className={styles.loading}>Loading git diff…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pane}>
        <span className={styles.loading}>Failed to load git diff — see error center</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <section className={styles.pane}>
      <header className={styles.header}>
        <GitDiff className={styles.headerIcon} aria-hidden="true" />
        <span className={styles.headerPath}>{tildePath(data.repo_path, home)}</span>
        <span className={styles.summary}>
          <span>{data.summary.files} changed</span>
          {data.summary.staged_files !== undefined && (
            <span>{data.summary.staged_files} staged</span>
          )}
          {data.summary.unstaged_files !== undefined && (
            <span>{data.summary.unstaged_files} unstaged</span>
          )}
          <span className={styles.additions}>+{data.summary.additions}</span>
          <span className={styles.deletions}>-{data.summary.deletions}</span>
        </span>
        <IconButton
          className={styles.refreshButton}
          onClick={() => void refetch()}
          aria-label="Refresh diff"
          title="Refresh diff"
        >
          <Refresh />
        </IconButton>
      </header>

      {data.files.length === 0 ? (
        <div className={styles.empty}>
          No staged, unstaged, or untracked changes in <code>{data.repo}</code>.
        </div>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.fileList}>
            {data.files.map((file) => (
              <button
                type="button"
                key={file.path}
                ref={(el) => {
                  if (el) fileButtonRefs.current.set(file.path, el);
                  else fileButtonRefs.current.delete(file.path);
                }}
                className={styles.fileCard}
                data-selected={file.path === selectedFile?.path || undefined}
                onClick={() => setSelectedPath(file.path)}
              >
                <span className={styles.fileName}>{file.path}</span>
                <span className={styles.fileBadges}>
                  <span className={styles.statusBadge} data-status={file.status}>
                    {STATUS_LABEL[file.status]}
                  </span>
                  {(file.sections ?? []).map((section) => (
                    <span
                      key={section.kind}
                      className={styles.sectionBadge}
                      data-kind={section.kind}
                    >
                      {section.kind}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </aside>

          <div className={styles.diffPane} ref={diffPaneRef}>
            {selectedFile && (
              <DiffView key={selectedFile.path} file={toDiffViewFile(selectedFile)} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
