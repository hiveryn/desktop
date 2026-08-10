import type { DiffViewFile, DiffViewSection } from '@components';
import { Back, DiffView, Forward, GitDiff, IconButton, Refresh } from '@components';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RepoDiffFile, RepoDiffResponse } from '../../../../../shared/types';
import type { ShortcutConfig } from '../../../hooks/useShortcutConfig';
import { createChordMatcher } from '../../../keys/chords';
import { registerDynamicHandler } from '../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../keys/matchers';
import { GIT_DIFF_BINDING_DEFAULTS, resolveBindings } from '../../../keys/paneBindings';
import { usePaneLayoutStore } from '../../../state/paneLayoutStore';
import { useEventsForActiveSession } from '../../../state/selectors';
import type { SessionRepoScope } from '../../../state/sessionRepoScope';
import { useSessionStore } from '../../../state/sessionStore';
import styles from './GitDiffPane.module.css';
import { buildDiffTree, type DiffTreeRow, flattenDiffTree } from './gitDiffTree';
import RepoPicker, { type RepoOption } from './RepoPicker';

// Tool names normalized by agentruntime (agentruntime/adapter/*/normalize.go)
// that mutate the working tree. Bash is deliberately excluded — most Bash
// calls (test runs, `ls`, etc.) aren't file mutations and would cause noisy
// over-refetching.
const FILE_MUTATING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'ApplyPatch']);
const REFETCH_DEBOUNCE_MS = 1500;

// Chord / jump parameters — same values as the files explorer so the two
// panes share one keyboard feel.
const CHORD_TIMEOUT_MS = 1000;
const JUMP_ROWS = 6;

// Single-letter status markers, git-porcelain style, colored via the same
// data-status mapping the old word badges used.
const STATUS_CHAR: Record<RepoDiffFile['status'], string> = {
  modified: 'M',
  new: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: '?',
};

function tildePath(path: string, home: string): string {
  if (home && (path === home || path.startsWith(`${home}/`))) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Wraps idx by delta within [0, len). idx === -1 (no current cursor) lands
// on the first row moving down, or the last row moving up.
function wrapIndex(idx: number, delta: number, len: number): number {
  if (len === 0) return -1;
  const base = idx === -1 ? (delta > 0 ? -1 : 0) : idx;
  return (base + delta + len) % len;
}

// A compressed dir label can span several segments ("renderer/src/pages/");
// only the leaf segment gets the full dir color, ancestors render subtle.
function splitDirLabel(label: string): { prefix: string; leaf: string } {
  const cut = label.lastIndexOf('/', label.length - 2);
  return cut === -1
    ? { prefix: '', leaf: label }
    : { prefix: label.slice(0, cut + 1), leaf: label.slice(cut + 1) };
}

function splitPath(path: string): { dir: string; base: string } {
  const idx = path.lastIndexOf('/');
  return idx === -1
    ? { dir: '', base: path }
    : { dir: path.slice(0, idx + 1), base: path.slice(idx + 1) };
}

function hasSection(file: RepoDiffFile, kind: 'staged' | 'unstaged'): boolean {
  return (file.sections ?? []).some((section) => section.kind === kind);
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
  repoScope: SessionRepoScope;
  shortcutConfig: ShortcutConfig | null;
}

export default function GitDiffPane({
  sessionId,
  architectKey,
  isActive,
  repoScope,
  shortcutConfig,
}: Props) {
  const [home, setHome] = useState('');
  // The repo currently being diffed. Every repository scoped to the ticket is
  // selectable via the header picker; the primary is the default. null until
  // the scope resolves and initializes it.
  const [selectedRepoKey, setSelectedRepoKey] = useState<string | null>(null);
  const [data, setData] = useState<RepoDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // The file whose diff is shown (background highlight) — distinct from the
  // keyboard cursor, which can rest on a directory row.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [cursorKey, setCursorKey] = useState<string | null>(null);
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(new Set());
  // Window-lifetime preference — survives session switches and pane remounts.
  const sidebarCollapsed = usePaneLayoutStore((s) => s.gitDiffSidebarCollapsed);
  const toggleSidebar = usePaneLayoutStore((s) => s.toggleGitDiffSidebar);
  const diffPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.hiveryn.system.getUserHome().then(setHome, () => {});
  }, []);

  // Every repository scoped to the ticket, primary first. Empty unless the
  // scope resolved cleanly.
  const repoOptions = useMemo<RepoOption[]>(() => {
    if (repoScope.status !== 'ready') return [];
    return [
      { repoKey: repoScope.primary.repoKey, isPrimary: true },
      ...repoScope.additional.map((entry) => ({ repoKey: entry.repoKey, isPrimary: false })),
    ];
  }, [repoScope]);

  // Default the selection to the primary repo, and re-default whenever the
  // resolved scope changes (session restoration into another session preserves
  // the primary default). Self-heals if the selected repo leaves scope.
  useEffect(() => {
    if (repoScope.status !== 'ready') {
      if (selectedRepoKey !== null) setSelectedRepoKey(null);
      return;
    }
    if (!repoOptions.some((option) => option.repoKey === selectedRepoKey)) {
      setSelectedRepoKey(repoScope.primary.repoKey);
    }
  }, [repoScope, repoOptions, selectedRepoKey]);

  const refetch = useCallback(async () => {
    if (!architectKey || !selectedRepoKey) return;
    setLoading(true);
    setError(null);
    try {
      const next = await window.hiveryn.repos.diff(architectKey, selectedRepoKey);
      setData(next);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [architectKey, selectedRepoKey]);

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

  // ── Tree rows (the keyboard handler and the renderer walk this one list) ──
  const rows = useMemo(
    () => (data ? flattenDiffTree(buildDiffTree(data.files), collapsedDirs) : []),
    [data, collapsedDirs],
  );

  // ── "/" filter over changed files ─────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterSel, setFilterSel] = useState(0);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = filterQuery.trim();
  // The filter replaces the tree only once there's something to match.
  const filterActive = filterOpen && trimmedQuery !== '';
  const matches = useMemo(() => {
    if (!filterActive || !data) return [];
    const q = trimmedQuery.toLowerCase();
    return data.files.filter((f) => f.path.toLowerCase().includes(q));
  }, [filterActive, data, trimmedQuery]);

  // The pane instance is shared across sessions and repositories — clear all
  // diff, filter, and selection state before the selected repo's diff loads, so
  // one session's or repo's state never bleeds into another. Keyed on the
  // selected repo as well as the session so switching repositories resets too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId/selectedRepoKey are trigger deps, not read inside the effect
  useEffect(() => {
    setData(null);
    setError(null);
    setFilterOpen(false);
    setFilterQuery('');
    setFilterSel(0);
    setCollapsedDirs(new Set());
    setCursorKey(null);
    setSelectedPath(null);
  }, [sessionId, selectedRepoKey]);

  useEffect(() => {
    if (filterOpen) filterInputRef.current?.focus();
  }, [filterOpen]);

  // Keep the filter selection inside the (possibly shrunk) match list.
  useEffect(() => {
    setFilterSel((sel) => (matches.length === 0 ? 0 : Math.min(sel, matches.length - 1)));
  }, [matches.length]);

  const selectedFile = useMemo(() => {
    if (!data) return null;
    return data.files.find((f) => f.path === selectedPath) ?? data.files[0] ?? null;
  }, [data, selectedPath]);

  const toggleDir = (path: string): void => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setCursorKey(path);
  };

  // Cursor moves auto-open file diffs (unlike the explorer's cursor-then-o
  // model): one-keystroke file hopping is the core diff-review motion.
  const moveCursorToRow = (row: DiffTreeRow): void => {
    setCursorKey(row.key);
    if (row.node.kind === 'file') setSelectedPath(row.node.file.path);
  };

  const closeFilter = (): void => {
    setFilterOpen(false);
    setFilterQuery('');
    setFilterSel(0);
  };

  const openFilterResult = (file: RepoDiffFile): void => {
    // Re-expand any collapsed ancestor so the opened file's row is visible.
    setCollapsedDirs((prev) => {
      const kept = [...prev].filter((dir) => !file.path.startsWith(`${dir}/`));
      return kept.length === prev.size ? prev : new Set(kept);
    });
    setSelectedPath(file.path);
    setCursorKey(file.path);
    closeFilter();
  };

  const handleFilterKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    const consume = (): void => {
      e.preventDefault();
      // Without this the event still bubbles to the document-level key
      // dispatcher, which re-handles it against post-handler DOM state (see
      // the equivalent guard in FilesPane).
      e.stopPropagation();
    };
    if (e.key === 'ArrowDown') {
      consume();
      setFilterSel((sel) => Math.min(sel + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      consume();
      setFilterSel((sel) => Math.max(sel - 1, 0));
    } else if (e.key === 'Enter') {
      consume();
      const match = matches[filterSel];
      if (match) openFilterResult(match);
    } else if (e.key === 'Escape') {
      consume();
      closeFilter();
    } else if (e.key === 'Tab') {
      // Hand off to list navigation: once the input is blurred, the pane
      // handler routes j/k, gg/G, {/} and o/Enter to the match rows.
      consume();
      filterInputRef.current?.blur();
    }
  };

  // ── Pane-local keyboard shortcuts ──────────────────────────────────────────
  const isGitDiffFocused = useSessionStore((s) => s.focusedPane === 'right-git-diff');
  const shortcutConfigRef = useRef(shortcutConfig);
  shortcutConfigRef.current = shortcutConfig;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const cursorKeyRef = useRef(cursorKey);
  cursorKeyRef.current = cursorKey;
  const filterOpenRef = useRef(filterOpen);
  filterOpenRef.current = filterOpen;
  const filterActiveRef = useRef(filterActive);
  filterActiveRef.current = filterActive;
  const filterSelRef = useRef(filterSel);
  filterSelRef.current = filterSel;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const moveCursorToRowRef = useRef(moveCursorToRow);
  moveCursorToRowRef.current = moveCursorToRow;
  const toggleDirRef = useRef(toggleDir);
  toggleDirRef.current = toggleDir;
  const openFilterResultRef = useRef(openFilterResult);
  openFilterResultRef.current = openFilterResult;
  const chordRef = useRef(createChordMatcher(CHORD_TIMEOUT_MS));

  useEffect(() => {
    if (!isGitDiffFocused) return;
    return registerDynamicHandler((e) => {
      const cfg = shortcutConfigRef.current;
      if (!cfg) return 'passthrough';
      if (e.repeat) return 'passthrough';
      if (isTextInputFocused()) return 'passthrough';
      // Modifier-bearing combos belong to global shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return 'passthrough';

      const bindings = resolveBindings(cfg['git-diff'], GIT_DIFF_BINDING_DEFAULTS);
      const DOWN = bindings.down;
      const UP = bindings.up;
      const RIGHT = bindings.right;
      const LEFT = bindings.left;
      const OPEN = bindings.open;
      const SCROLL_DOWN = bindings['scroll-down'];
      const SCROLL_UP = bindings['scroll-up'];
      const REFRESH = bindings.refresh;
      const TOP = bindings.top;
      const BOTTOM = bindings.bottom;
      const JUMP_DOWN = bindings['jump-down'];
      const JUMP_UP = bindings['jump-up'];
      const SEARCH = bindings.search;
      const TOGGLE_SIDEBAR = bindings['toggle-sidebar'];

      // Any key that reaches the handler resets the pending chord prefix
      // (match() below may re-arm it).
      chordRef.current.begin(e);

      // Escape closes an open filter even when focus has wandered off the
      // input (its own onKeyDown covers the focused case via the text-input
      // guard above). Only consumed while the filter is open.
      if (filterOpenRef.current && e.key === 'Escape') {
        setFilterOpen(false);
        setFilterQuery('');
        setFilterSel(0);
        return 'consumed';
      }
      // Tab (and Shift+Tab) hop back into the filter input; the input's own
      // Tab handler blurs it — together they toggle typing ↔ list navigation.
      if (filterOpenRef.current && e.key === 'Tab') {
        filterInputRef.current?.focus();
        return 'consumed';
      }
      if (matchesShortcut(e, SEARCH)) {
        // Already open: re-focus the input (e.g. after clicking elsewhere).
        setFilterOpen(true);
        filterInputRef.current?.focus();
        return 'consumed';
      }

      // The movement keys drive whichever row list is on screen: active
      // filter matches take precedence (they replace the tree).
      const inResults = filterActiveRef.current;
      const nav = ((): { length: number; index: number; set(i: number): void } => {
        if (inResults) {
          return {
            length: matchesRef.current.length,
            index: filterSelRef.current,
            set: (i) => setFilterSel(i),
          };
        }
        const treeRows = rowsRef.current;
        return {
          length: treeRows.length,
          index: treeRows.findIndex((r) => r.key === cursorKeyRef.current),
          set: (i) => moveCursorToRowRef.current(treeRows[i]),
        };
      })();

      const topMatch = chordRef.current.match(TOP);
      if (topMatch !== 'no') {
        if (topMatch === 'matched' && nav.length > 0) nav.set(0);
        return 'consumed';
      }
      const bottomMatch = chordRef.current.match(BOTTOM);
      if (bottomMatch !== 'no') {
        if (bottomMatch === 'matched' && nav.length > 0) nav.set(nav.length - 1);
        return 'consumed';
      }

      if (matchesShortcut(e, REFRESH)) {
        void refetchRef.current();
        return 'consumed';
      }
      if (matchesShortcut(e, TOGGLE_SIDEBAR)) {
        usePaneLayoutStore.getState().toggleGitDiffSidebar();
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

      if (matchesShortcut(e, DOWN)) {
        const idx = wrapIndex(nav.index, 1, nav.length);
        if (idx !== -1) nav.set(idx);
        return 'consumed';
      }
      if (matchesShortcut(e, UP)) {
        const idx = wrapIndex(nav.index, -1, nav.length);
        if (idx !== -1) nav.set(idx);
        return 'consumed';
      }
      if (matchesShortcut(e, JUMP_DOWN)) {
        // No cursor yet (-1) behaves like jumping from before the first row.
        if (nav.length > 0) nav.set(Math.min(nav.index + JUMP_ROWS, nav.length - 1));
        return 'consumed';
      }
      if (matchesShortcut(e, JUMP_UP)) {
        const start = nav.index === -1 ? nav.length : nav.index;
        if (nav.length > 0) nav.set(Math.max(start - JUMP_ROWS, 0));
        return 'consumed';
      }

      // Open: files show their diff; directories toggle. Enter is always
      // accepted alongside the configured key.
      if (matchesShortcut(e, OPEN) || e.key === 'Enter') {
        if (inResults) {
          const match = matchesRef.current[filterSelRef.current];
          if (match) openFilterResultRef.current(match);
          return 'consumed';
        }
        const row = rowsRef.current.find((r) => r.key === cursorKeyRef.current);
        if (row) {
          if (row.node.kind === 'dir') toggleDirRef.current(row.key);
          else setSelectedPath(row.node.file.path);
        }
        return 'consumed';
      }

      // l/h are tree motions — inert while filter matches are shown.
      if (inResults) return 'passthrough';

      if (matchesShortcut(e, RIGHT)) {
        // Directories only — opening files is OPEN/Enter's job.
        const row = rowsRef.current.find((r) => r.key === cursorKeyRef.current);
        if (row && row.node.kind === 'dir' && !row.expanded) {
          toggleDirRef.current(row.key);
        }
        return 'consumed';
      }
      if (matchesShortcut(e, LEFT)) {
        const treeRows = rowsRef.current;
        const row = treeRows.find((r) => r.key === cursorKeyRef.current);
        if (row) {
          if (row.node.kind === 'dir' && row.expanded) {
            toggleDirRef.current(row.key);
          } else if (row.parentKey !== null) {
            setCursorKey(row.parentKey);
          }
        }
        return 'consumed';
      }

      return 'passthrough';
    });
  }, [isGitDiffFocused]);

  // ── Keep the cursor row scrolled into view ─────────────────────────────────
  const rowRefsMap = useRef(new Map<string, HTMLElement>());
  const setRowRef = useCallback((key: string, node: HTMLElement | null) => {
    if (node) rowRefsMap.current.set(key, node);
    else rowRefsMap.current.delete(key);
  }, []);
  // `rows` is a trigger dep so a cursor row revealed by an expand still gets
  // scrolled to once it exists.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rows is a trigger dep, read via rowRefsMap
  useEffect(() => {
    if (!cursorKey) return;
    rowRefsMap.current.get(cursorKey)?.scrollIntoView({ block: 'nearest' });
  }, [cursorKey, rows]);

  const filterRowRefs = useRef(new Map<number, HTMLElement>());
  useEffect(() => {
    if (!filterActive) return;
    filterRowRefs.current.get(filterSel)?.scrollIntoView({ block: 'nearest' });
  }, [filterActive, filterSel]);

  // ── Re-clamp the cursor whenever it points at a row that's no longer
  // visible (collapse, refetch reshuffle, session switch). Rows derive
  // synchronously from `data`, so there's no in-flight settling to wait out —
  // prefer the shown diff's row, else the first row. ────────────────────────
  useEffect(() => {
    if (!data) return;
    if (rows.length === 0) {
      if (cursorKey !== null) setCursorKey(null);
      return;
    }
    if (cursorKey !== null && rows.some((r) => r.key === cursorKey)) return;
    const selectedRowVisible =
      selectedFile !== null && rows.some((r) => r.key === selectedFile.path);
    setCursorKey(selectedRowVisible ? selectedFile.path : rows[0].key);
  }, [data, rows, cursorKey, selectedFile]);

  if (repoScope.status === 'loading') {
    return (
      <div className={styles.pane}>
        <span className={styles.loading}>Loading…</span>
      </div>
    );
  }

  if (repoScope.status === 'none') {
    return (
      <div className={styles.pane}>
        <span className={styles.loading}>No repository associated with this session.</span>
      </div>
    );
  }

  if (repoScope.status === 'error') {
    return (
      <div className={styles.pane}>
        <div className={styles.errorBlock}>
          <span>Failed to resolve repository scope: {errorText(repoScope.error)}</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.pane}>
        <div className={styles.errorBlock}>
          <span>Failed to load git diff: {errorText(error)}</span>
          <button type="button" className={styles.retryButton} onClick={() => void refetch()}>
            Retry
          </button>
        </div>
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

  if (!data) return null;

  return (
    <section className={styles.pane}>
      <header className={styles.header}>
        <IconButton
          className={styles.collapseButton}
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Show file list' : 'Hide file list'}
          title={sidebarCollapsed ? 'Show file list' : 'Hide file list'}
        >
          {sidebarCollapsed ? <Forward /> : <Back />}
        </IconButton>
        <GitDiff className={styles.headerIcon} aria-hidden="true" />
        {selectedRepoKey && (
          <RepoPicker
            options={repoOptions}
            selectedRepoKey={selectedRepoKey}
            onSelect={setSelectedRepoKey}
          />
        )}
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

      {error != null && (
        <div className={styles.errorBanner}>
          <span>Diff refresh failed: {errorText(error)}</span>
          <button type="button" className={styles.retryButton} onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      {filterOpen && (
        <div className={styles.filterBar}>
          <input
            ref={filterInputRef}
            className={styles.filterInput}
            type="text"
            placeholder="Filter changed files…"
            spellCheck={false}
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            onKeyDown={handleFilterKeyDown}
          />
        </div>
      )}

      {data.files.length === 0 ? (
        <div className={styles.empty}>
          No staged, unstaged, or untracked changes in <code>{data.repo}</code>.
        </div>
      ) : (
        <div className={styles.workspace} data-collapsed={sidebarCollapsed || undefined}>
          <aside className={styles.fileList}>
            {filterActive ? (
              <>
                {matches.length === 0 && (
                  <div className={styles.listMessage}>No changed files match</div>
                )}
                {matches.map((file, i) => {
                  const { dir, base } = splitPath(file.path);
                  return (
                    <button
                      key={file.path}
                      type="button"
                      ref={(el) => {
                        if (el) filterRowRefs.current.set(i, el);
                        else filterRowRefs.current.delete(i);
                      }}
                      className={styles.matchRow}
                      data-selected={i === filterSel || undefined}
                      onMouseMove={() => setFilterSel(i)}
                      onClick={() => openFilterResult(file)}
                    >
                      <span className={styles.statusChar} data-status={file.status}>
                        {STATUS_CHAR[file.status]}
                      </span>
                      <span className={styles.matchBase}>{base}</span>
                      {dir !== '' && <span className={styles.matchDir}>{dir}</span>}
                    </button>
                  );
                })}
              </>
            ) : (
              rows.map((row) => {
                if (row.node.kind === 'dir') {
                  const { prefix, leaf } = splitDirLabel(row.node.label);
                  return (
                    <button
                      key={row.key}
                      type="button"
                      ref={(el) => setRowRef(row.key, el)}
                      className={styles.row}
                      data-cursor={cursorKey === row.key || undefined}
                      style={{ paddingLeft: `calc(var(--space-h-2) + ${row.depth} * 2ch)` }}
                      onClick={() => toggleDir(row.key)}
                    >
                      <span className={styles.glyph} aria-hidden="true">
                        {row.expanded ? '▾' : '▸'}
                      </span>
                      <span className={styles.dirLabel}>
                        {prefix !== '' && <span className={styles.dirPrefix}>{prefix}</span>}
                        {leaf}
                      </span>
                    </button>
                  );
                }
                const file = row.node.file;
                return (
                  <button
                    key={row.key}
                    type="button"
                    ref={(el) => setRowRef(row.key, el)}
                    className={styles.row}
                    data-cursor={cursorKey === row.key || undefined}
                    data-selected={file.path === selectedFile?.path || undefined}
                    data-status={file.status}
                    style={{ paddingLeft: `calc(var(--space-h-2) + ${row.depth} * 2ch)` }}
                    onClick={() => {
                      setSelectedPath(file.path);
                      setCursorKey(file.path);
                    }}
                  >
                    <span className={styles.glyph} aria-hidden="true">
                      {' '}
                    </span>
                    <span className={styles.fileName}>{row.node.name}</span>
                    <span className={styles.statusChar} data-status={file.status}>
                      {STATUS_CHAR[file.status]}
                    </span>
                    <span className={styles.stageDots} aria-hidden="true">
                      <span data-kind="staged" data-on={hasSection(file, 'staged') || undefined}>
                        ●
                      </span>
                      <span
                        data-kind="unstaged"
                        data-on={hasSection(file, 'unstaged') || undefined}
                      >
                        ○
                      </span>
                    </span>
                  </button>
                );
              })
            )}
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
