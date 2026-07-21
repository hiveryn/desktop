import { Back, Forward, IconButton, Refresh } from '@components';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Architect, FsEntry, FsSearchMatch } from '../../../../../../shared/types';
import type { ShortcutConfig } from '../../../../hooks/useShortcutConfig';
import { createChordMatcher } from '../../../../keys/chords';
import { registerDynamicHandler } from '../../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../../keys/matchers';
import { useFilesStore } from '../../../../state/filesStore';
import { usePaneLayoutStore } from '../../../../state/paneLayoutStore';
import type { SessionRepoScope } from '../../../../state/sessionRepoScope';
import { useSessionStore } from '../../../../state/sessionStore';
import Breadcrumb from './Breadcrumb';
import DirListing from './DirListing';
import DirTree from './DirTree';
import { joinPath, sortEntries } from './dirTreeUtils';
import styles from './FilesPane.module.css';
import FileViewer, { type FileViewerHandle } from './FileViewer';
import RootPicker, { type RootOption } from './RootPicker';
import SearchResults from './SearchResults';
import { useDirListing } from './useDirListing';
import { useDirTreeData } from './useDirTreeData';
import { useFileSearch } from './useFileSearch';

// Below this pane width the two-pane layout collapses into the drill-down
// single-pane mode. Self-measured — the tab framework has no width signal.
const WIDE_MIN_WIDTH = 640;

// Max gap between the keys of a chord binding (e.g. "g g") before the pending
// prefix expires and the next key is handled on its own.
const CHORD_TIMEOUT_MS = 1000;

// Rows moved by the { / } jump keys (clamped at the list edges, no wrap).
const JUMP_ROWS = 6;

const EMPTY_EXPANDED: string[] = [];

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

// Wraps idx by delta within [0, len). idx === -1 (no current cursor) lands
// on the first row moving down, or the last row moving up.
function wrapIndex(idx: number, delta: number, len: number): number {
  if (len === 0) return -1;
  const base = idx === -1 ? (delta > 0 ? -1 : 0) : idx;
  return (base + delta + len) % len;
}

interface Props {
  sessionId: string;
  architect: Architect;
  isActive: boolean;
  /** Per-session repository scope (primary + additional repos). */
  repoScope: SessionRepoScope;
  shortcutConfig: ShortcutConfig | null;
}

export default function FilesPane({
  sessionId,
  architect,
  isActive,
  repoScope,
  shortcutConfig,
}: Props) {
  const customRoots = useFilesStore((s) => s.customRoots);
  const slice = useFilesStore((s) => s.bySession[sessionId]);
  const addCustomRoot = useFilesStore((s) => s.addCustomRoot);
  const setRoot = useFilesStore((s) => s.setRoot);
  const setCurrentDir = useFilesStore((s) => s.setCurrentDir);
  const setOpenFile = useFilesStore((s) => s.setOpenFile);
  const toggleExpanded = useFilesStore((s) => s.toggleExpanded);
  const expandDirs = useFilesStore((s) => s.expandDirs);
  const setCursorPath = useFilesStore((s) => s.setCursorPath);

  const isFilesFocused = useSessionStore((s) => s.focusedPane === 'right-files');

  const roots = useMemo<RootOption[]>(() => {
    const repoOptions = new Map<string, RootOption>();
    // The session snapshot is authoritative for every repo scoped to the ticket
    // session — its immutable workdir is the path the running session was
    // launched against. Seed these first (primary first) so a scoped repo key
    // can never be overridden by drifted architect config below.
    if (repoScope.status === 'ready') {
      for (const entry of [repoScope.primary, ...repoScope.additional]) {
        const id = `repo:${entry.repoKey}`;
        repoOptions.set(id, { id, label: entry.repoKey, path: entry.workdir, kind: 'repo' });
      }
    }
    // Current architect config may still supply non-session roots, but it must
    // not override a scoped repo key — only repos absent from the scope are
    // added, at whatever path config currently resolves them to.
    for (const repo of architect.repos ?? []) {
      const id = `repo:${repo.key}`;
      if (!repoOptions.has(id)) {
        repoOptions.set(id, { id, label: repo.key, path: repo.path, kind: 'repo' });
      }
    }
    return [
      { id: 'workspace', label: architect.name, path: architect.path, kind: 'workspace' },
      ...repoOptions.values(),
      ...customRoots.map(
        (root): RootOption => ({
          id: `custom:${root.path}`,
          label: root.label,
          path: root.path,
          kind: 'custom',
        }),
      ),
    ];
  }, [architect, customRoots, repoScope]);

  // First time this session's tab is used, default the root from the session's
  // repository scope: ticket sessions open on their primary repo (using the
  // immutable snapshot workdir), non-ticket sessions on the workspace root.
  useEffect(() => {
    if (slice) return;
    // Scope still resolving — wait rather than latching a root prematurely.
    if (repoScope.status === 'loading') return;
    // Invalid scope surfaces as a visible error below — never silently fall
    // back to the workspace root, which would masquerade as a valid workspace.
    if (repoScope.status === 'error') return;
    if (repoScope.status === 'ready') {
      setRoot(sessionId, `repo:${repoScope.primary.repoKey}`, repoScope.primary.workdir);
    } else {
      setRoot(sessionId, 'workspace', architect.path);
    }
  }, [slice, sessionId, architect.path, repoScope, setRoot]);

  // ── Responsive mode (self-measured; no width signal in the tab framework) ─
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      // A hidden tab panel (display:none while another right tab is active)
      // measures 0. Ignore it — otherwise the pane latches into narrow mode
      // before its first visible paint and only corrects on the next resize.
      if (width !== undefined && width > 0) setPaneWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const wide = paneWidth === null || paneWidth >= WIDE_MIN_WIDTH;

  // Window-lifetime preference — survives session switches and pane remounts.
  const sidebarCollapsed = usePaneLayoutStore((s) => s.filesSidebarCollapsed);
  const toggleSidebar = usePaneLayoutStore((s) => s.toggleFilesSidebar);

  // ── Refetch on tab activation + manual refresh ────────────────────────────
  const [refreshSeq, setRefreshSeq] = useState(0);
  const firstActivationRef = useRef(true);
  useEffect(() => {
    if (!isActive) return;
    // The mount fetch already covers the first activation.
    if (firstActivationRef.current) {
      firstActivationRef.current = false;
      return;
    }
    setRefreshSeq((seq) => seq + 1);
  }, [isActive]);

  const rootId = slice?.rootId ?? '';
  const rootPath = slice?.rootPath ?? '';
  const currentDir = slice?.currentDir ?? '';
  const openFilePath = slice?.openFilePath ?? null;
  const expandedDirs = slice?.expandedDirs ?? EMPTY_EXPANDED;
  const cursorPath = slice?.cursorPath ?? null;

  // ── Shared tree/listing fetch state — one instance, consumed by both the
  // renderer (DirTree/DirListing) and the keyboard handler below ───────────
  const {
    rows,
    nodes,
    settled: treeSettled,
    retry,
  } = useDirTreeData(rootPath, expandedDirs, refreshSeq);
  const narrowListing = useDirListing(slice && !wide ? currentDir : null, refreshSeq);
  const narrowEntries = useMemo(
    () => sortEntries(narrowListing.data?.entries ?? []),
    [narrowListing.data],
  );

  // ── "/" filename search ───────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSel, setSearchSel] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = searchQuery.trim();
  const search = useFileSearch(searchOpen ? rootPath : '', trimmedQuery);
  // Search replaces the tree/listing only once there's something to match.
  const searchActive = searchOpen && trimmedQuery !== '';

  // The pane instance is shared across sessions — never carry an open search
  // (or its query) over to another session's or root's context.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId/rootPath are trigger deps, not read inside the effect
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchSel(0);
  }, [sessionId, rootPath]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Keep the selection inside the (possibly shrunk) result list.
  const matchCount = search.data?.matches.length ?? 0;
  useEffect(() => {
    setSearchSel((sel) => (matchCount === 0 ? 0 : Math.min(sel, matchCount - 1)));
  }, [matchCount]);

  const handleSelectRoot = (root: RootOption): void => {
    setRoot(sessionId, root.id, root.path);
  };

  const handlePickCustom = async (): Promise<void> => {
    const picked = await window.hiveryn.fs.pickDirectory();
    if (picked === null) return; // dialog cancelled
    addCustomRoot(picked);
    setRoot(sessionId, `custom:${picked}`, picked);
  };

  const handleOpenFile = (path: string): void => {
    setOpenFile(sessionId, path);
    setCursorPath(sessionId, path);
    // A relative markdown link can resolve outside the picker root; the
    // breadcrumb only renders paths under the root, so leave it in place then.
    const parent = parentDir(path);
    const rootPrefix = rootPath.endsWith('/') ? rootPath : `${rootPath}/`;
    if (parent === rootPath || parent.startsWith(rootPrefix)) {
      setCurrentDir(sessionId, parent);
    }
  };

  const handleToggleDir = (path: string): void => {
    toggleExpanded(sessionId, path);
    setCurrentDir(sessionId, path);
    setCursorPath(sessionId, path);
  };

  const handleBreadcrumbNavigate = (path: string): void => {
    setCurrentDir(sessionId, path);
    if (openFilePath && !openFilePath.startsWith(path.endsWith('/') ? path : `${path}/`)) {
      setOpenFile(sessionId, null);
    }
  };

  const closeSearch = (): void => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchSel(0);
  };

  const openSearchResult = (relPath: string): void => {
    const abs = joinPath(rootPath, relPath);
    // Expand every ancestor between the root and the file so the tree shows
    // the opened result in place instead of an orphaned selection.
    const rootPrefix = rootPath.endsWith('/') ? rootPath : `${rootPath}/`;
    const ancestors: string[] = [];
    for (let dir = parentDir(abs); dir !== rootPath && dir.startsWith(rootPrefix); ) {
      ancestors.push(dir);
      dir = parentDir(dir);
    }
    if (ancestors.length > 0) expandDirs(sessionId, ancestors);
    handleOpenFile(abs);
    closeSearch();
  };

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    const searchMatches = search.data?.matches ?? [];
    const consume = (): void => {
      e.preventDefault();
      // Without this the event still bubbles to the document-level key
      // dispatcher, which re-handles it against post-handler DOM state —
      // Tab's blur() below, for instance, made the pane handler see a
      // blurred input and re-focus it in the same keystroke.
      e.stopPropagation();
    };
    if (e.key === 'ArrowDown') {
      consume();
      setSearchSel((sel) => Math.min(sel + 1, Math.max(searchMatches.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      consume();
      setSearchSel((sel) => Math.max(sel - 1, 0));
    } else if (e.key === 'Enter') {
      consume();
      const match = searchMatches[searchSel];
      if (match) openSearchResult(match.path);
    } else if (e.key === 'Escape') {
      consume();
      closeSearch();
    } else if (e.key === 'Tab') {
      // Hand off to list navigation: once the input is blurred, the pane
      // handler routes j/k, gg/G, {/} and o/Enter to the visible rows.
      // Tab from the list side re-focuses the input (see the key handler).
      consume();
      searchInputRef.current?.blur();
    }
  };

  // ── Pane-local keyboard shortcuts ────────────────────────────────────────
  const shortcutConfigRef = useRef(shortcutConfig);
  shortcutConfigRef.current = shortcutConfig;

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const cursorPathRef = useRef(cursorPath);
  cursorPathRef.current = cursorPath;

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const narrowEntriesRef = useRef<FsEntry[]>(narrowEntries);
  narrowEntriesRef.current = narrowEntries;

  const currentDirRef = useRef(currentDir);
  currentDirRef.current = currentDir;

  const rootPathRef = useRef(rootPath);
  rootPathRef.current = rootPath;

  const openFilePathRef = useRef(openFilePath);
  openFilePathRef.current = openFilePath;

  const wideRef = useRef(wide);
  wideRef.current = wide;

  // Pending chord prefix (e.g. the first "g" of "g g") lives inside the
  // matcher; begin() clears it, so any key that doesn't continue the chord
  // is handled normally.
  const chordRef = useRef(createChordMatcher(CHORD_TIMEOUT_MS));

  const handleOpenFileRef = useRef(handleOpenFile);
  handleOpenFileRef.current = handleOpenFile;

  const handleToggleDirRef = useRef(handleToggleDir);
  handleToggleDirRef.current = handleToggleDir;

  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;

  const searchActiveRef = useRef(searchActive);
  searchActiveRef.current = searchActive;

  const searchSelRef = useRef(searchSel);
  searchSelRef.current = searchSel;

  const searchMatchesRef = useRef<FsSearchMatch[]>([]);
  searchMatchesRef.current = search.data?.matches ?? [];

  const openSearchResultRef = useRef(openSearchResult);
  openSearchResultRef.current = openSearchResult;

  const fileViewerRef = useRef<FileViewerHandle>(null);

  useEffect(() => {
    if (!isFilesFocused) return;
    return registerDynamicHandler((e) => {
      const cfg = shortcutConfigRef.current;
      if (!cfg) return 'passthrough';
      if (e.repeat) return 'passthrough';
      if (isTextInputFocused()) return 'passthrough';
      // Modifier-bearing combos belong to global shortcuts — except save,
      // which reaches the open editor even while focus sits on the tree.
      // (With the editor itself focused, its own Mod-s keymap handles this.)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        const SAVE = cfg.files?.save ?? 'cmd+s';
        if (matchesShortcut(e, SAVE) && fileViewerRef.current?.saveEditor()) return 'consumed';
        return 'passthrough';
      }

      const filesCfg = cfg.files ?? {};
      const DOWN = filesCfg.down ?? 'j';
      const UP = filesCfg.up ?? 'k';
      const RIGHT = filesCfg.right ?? 'l';
      const LEFT = filesCfg.left ?? 'h';
      const OPEN = filesCfg.open ?? 'o';
      const SCROLL_DOWN = filesCfg['scroll-down'] ?? 'shift+j';
      const SCROLL_UP = filesCfg['scroll-up'] ?? 'shift+k';
      const REFRESH = filesCfg.refresh ?? 'r';
      const TOP = filesCfg.top ?? 'g g';
      const BOTTOM = filesCfg.bottom ?? 'shift+g';
      const JUMP_DOWN = filesCfg['jump-down'] ?? 'shift+]';
      const JUMP_UP = filesCfg['jump-up'] ?? 'shift+[';
      const SEARCH = filesCfg.search ?? '/';
      const TOGGLE_SIDEBAR = filesCfg['toggle-sidebar'] ?? 'b';
      const EDIT = filesCfg.edit ?? 'i';

      // Any key that reaches the handler resets the pending chord prefix
      // (match() below may re-arm it).
      chordRef.current.begin(e);

      // Escape closes an open search even when focus has wandered off the
      // input (its own onKeyDown covers the focused case via the text-input
      // guard above). Only consumed while a search is open.
      if (searchOpenRef.current && e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchSel(0);
        return 'consumed';
      }
      // Tab (and Shift+Tab) hop back into the search input; the input's own
      // Tab handler blurs it — together they toggle typing ↔ list navigation.
      if (searchOpenRef.current && e.key === 'Tab') {
        searchInputRef.current?.focus();
        return 'consumed';
      }
      if (matchesShortcut(e, SEARCH)) {
        // Already open: re-focus the input (e.g. after clicking elsewhere).
        setSearchOpen(true);
        searchInputRef.current?.focus();
        return 'consumed';
      }

      const sid = sessionIdRef.current;

      // The movement keys drive whichever row list is on screen: active
      // search results take precedence (they replace the tree/listing),
      // otherwise the tree (wide) or the flat listing (narrow).
      const inResults = searchActiveRef.current;
      const nav = ((): { length: number; index: number; set(i: number): void } => {
        if (inResults) {
          return {
            length: searchMatchesRef.current.length,
            index: searchSelRef.current,
            set: (i) => setSearchSel(i),
          };
        }
        if (wideRef.current) {
          const treeRows = rowsRef.current;
          return {
            length: treeRows.length,
            index: treeRows.findIndex((r) => r.path === cursorPathRef.current),
            set: (i) => setCursorPath(sid, treeRows[i].path),
          };
        }
        const entries = narrowEntriesRef.current;
        const dir = currentDirRef.current;
        return {
          length: entries.length,
          index: entries.findIndex((en) => joinPath(dir, en.name) === cursorPathRef.current),
          set: (i) => setCursorPath(sid, joinPath(dir, entries[i].name)),
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
        setRefreshSeq((seq) => seq + 1);
        return 'consumed';
      }
      if (matchesShortcut(e, TOGGLE_SIDEBAR)) {
        // Mirrors the header collapse button, which only exists in wide mode.
        if (wideRef.current) usePaneLayoutStore.getState().toggleFilesSidebar();
        return 'consumed';
      }
      if (matchesShortcut(e, SCROLL_DOWN)) {
        fileViewerRef.current?.scrollHalfPage('down');
        return 'consumed';
      }
      if (matchesShortcut(e, SCROLL_UP)) {
        fileViewerRef.current?.scrollHalfPage('up');
        return 'consumed';
      }
      // Hand focus into the open file's editor (vim normal mode). Escape in
      // the editor's normal mode blurs it, handing focus back to the tree.
      if (matchesShortcut(e, EDIT)) {
        fileViewerRef.current?.focusEditor();
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

      // Open: files open in the viewer; directories toggle (wide) / drill
      // in (narrow). Enter is always accepted alongside the configured key.
      if (matchesShortcut(e, OPEN) || e.key === 'Enter') {
        if (inResults) {
          const match = searchMatchesRef.current[searchSelRef.current];
          if (match) openSearchResultRef.current(match.path);
          return 'consumed';
        }
        if (wideRef.current) {
          const row = rowsRef.current.find((r) => r.path === cursorPathRef.current);
          if (row) {
            if (row.entry.kind === 'dir') handleToggleDirRef.current(row.path);
            else handleOpenFileRef.current(row.path);
          }
        } else {
          const dir = currentDirRef.current;
          const entry = narrowEntriesRef.current.find(
            (en) => joinPath(dir, en.name) === cursorPathRef.current,
          );
          if (entry) {
            const entryPath = joinPath(dir, entry.name);
            if (entry.kind === 'dir') setCurrentDir(sid, entryPath);
            else handleOpenFileRef.current(entryPath);
          }
        }
        return 'consumed';
      }

      // l/h are tree/listing motions — inert while search results are shown.
      if (inResults) return 'passthrough';

      if (wideRef.current) {
        const treeRows = rowsRef.current;
        const cursor = cursorPathRef.current;

        if (matchesShortcut(e, RIGHT)) {
          // Directories only — opening files is OPEN/Enter's job.
          const row = treeRows.find((r) => r.path === cursor);
          if (row && row.entry.kind === 'dir' && !row.expanded) {
            handleToggleDirRef.current(row.path);
          }
          return 'consumed';
        }
        if (matchesShortcut(e, LEFT)) {
          const row = treeRows.find((r) => r.path === cursor);
          if (row) {
            if (row.entry.kind === 'dir' && row.expanded) {
              handleToggleDirRef.current(row.path);
            } else {
              const parent = parentDir(row.path);
              const parentRow = treeRows.find((r) => r.path === parent);
              if (parentRow) setCursorPath(sid, parentRow.path);
            }
          }
          return 'consumed';
        }
      } else {
        const entries = narrowEntriesRef.current;
        const dir = currentDirRef.current;
        const pathOf = (name: string): string => joinPath(dir, name);

        if (matchesShortcut(e, RIGHT)) {
          // Directories only — opening files is OPEN/Enter's job.
          const entry = entries.find((en) => pathOf(en.name) === cursorPathRef.current);
          if (entry && entry.kind === 'dir') setCurrentDir(sid, pathOf(entry.name));
          return 'consumed';
        }
        if (matchesShortcut(e, LEFT)) {
          // With a file open, LEFT first returns to the directory listing
          // (mirrors the header back button)…
          if (openFilePathRef.current !== null) {
            setOpenFile(sid, null);
            return 'consumed';
          }
          // …then walks up, but never above the picker root: the breadcrumb
          // (correctly) refuses to render dirs outside the root.
          if (dir !== rootPathRef.current) {
            const parent = parentDir(dir);
            if (parent !== dir) setCurrentDir(sid, parent);
          }
          return 'consumed';
        }
      }

      return 'passthrough';
    });
  }, [isFilesFocused, setCursorPath, setCurrentDir, setOpenFile]);

  // ── Keep the cursor row scrolled into view (wide mode; narrow mode does
  // its own equivalent inside DirListing) ───────────────────────────────────
  const rowRefsMap = useRef(new Map<string, HTMLElement>());
  const setRowRef = useCallback((path: string, node: HTMLElement | null) => {
    if (node) rowRefsMap.current.set(path, node);
    else rowRefsMap.current.delete(path);
  }, []);
  // `rows` is a trigger dep so a cursor row that appears only after its
  // ancestors finish loading (search-result reveal) still gets scrolled to.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rows is a trigger dep, read via rowRefsMap
  useEffect(() => {
    if (!wide || !cursorPath) return;
    rowRefsMap.current.get(cursorPath)?.scrollIntoView({ block: 'nearest' });
  }, [wide, cursorPath, rows]);

  // ── Re-clamp the cursor whenever it points at a path that's no longer
  // visible (collapsed elsewhere, refresh reshuffle, root/dir change) — but
  // never while listings are still settling: a search result's just-expanded
  // ancestors haven't produced their rows yet, and clamping early would
  // steal the cursor from the file before its row can appear. `treeSettled`
  // flips false in the same render an expansion happens (computed from
  // reachable-vs-loaded, not fetch flags), so there is no one-commit gap.
  // Narrow mode equivalently waits until the listing has data or an error.
  const narrowSettled = narrowListing.data !== null || narrowListing.error !== null;
  useEffect(() => {
    if (!slice) return;
    if (wide ? !treeSettled : !narrowSettled) return;
    const visiblePaths = wide
      ? rows.map((r) => r.path)
      : narrowEntries.map((e) => joinPath(currentDir, e.name));
    if (cursorPath !== null && visiblePaths.includes(cursorPath)) return;
    const fallback = visiblePaths[0] ?? null;
    if (fallback !== cursorPath) setCursorPath(sessionId, fallback);
  }, [
    slice,
    wide,
    treeSettled,
    narrowSettled,
    rows,
    narrowEntries,
    currentDir,
    cursorPath,
    sessionId,
    setCursorPath,
  ]);

  if (repoScope.status === 'error') {
    return (
      <section className={styles.pane}>
        <div className={styles.scopeError}>
          Failed to resolve this session's repository scope:{'\n'}
          {repoScope.error instanceof Error
            ? (repoScope.error.stack ?? repoScope.error.message)
            : String(repoScope.error)}
        </div>
      </section>
    );
  }

  if (!slice) return null;

  return (
    <section ref={paneRef} className={styles.pane}>
      <header className={styles.header}>
        {!wide && openFilePath && (
          <IconButton
            className={styles.backButton}
            onClick={() => setOpenFile(sessionId, null)}
            aria-label="Back to directory"
            title="Back to directory"
          >
            <Back />
          </IconButton>
        )}
        {wide && (
          <IconButton
            className={styles.collapseButton}
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Show file tree' : 'Hide file tree'}
            title={sidebarCollapsed ? 'Show file tree' : 'Hide file tree'}
          >
            {sidebarCollapsed ? <Forward /> : <Back />}
          </IconButton>
        )}
        <RootPicker
          roots={roots}
          activeRootId={rootId}
          onSelect={handleSelectRoot}
          onPickCustom={() => void handlePickCustom()}
        />
        <Breadcrumb
          rootPath={rootPath}
          currentDir={currentDir}
          onNavigate={handleBreadcrumbNavigate}
        />
        <IconButton
          className={styles.refreshButton}
          onClick={() => setRefreshSeq((seq) => seq + 1)}
          aria-label="Refresh"
          title="Refresh"
        >
          <Refresh />
        </IconButton>
      </header>

      {searchOpen && (
        <div className={styles.searchBar}>
          <input
            ref={searchInputRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search files by name…"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      )}

      {wide ? (
        <div className={styles.split} data-collapsed={sidebarCollapsed || undefined}>
          <aside className={styles.sidebar}>
            {searchActive ? (
              <SearchResults
                search={search}
                selectedIndex={searchSel}
                onHover={setSearchSel}
                onOpen={openSearchResult}
              />
            ) : (
              <DirTree
                rootPath={rootPath}
                rows={rows}
                nodes={nodes}
                selectedPath={openFilePath}
                cursorPath={cursorPath}
                onOpenFile={handleOpenFile}
                onToggleDir={handleToggleDir}
                onRetry={retry}
                rowRef={setRowRef}
              />
            )}
          </aside>
          <div className={styles.viewerPane}>
            {openFilePath ? (
              <FileViewer
                ref={fileViewerRef}
                path={openFilePath}
                refreshSeq={refreshSeq}
                onOpenFile={handleOpenFile}
              />
            ) : (
              <div className={styles.emptyViewer}>Select a file to preview</div>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.single}>
          {searchActive ? (
            <SearchResults
              search={search}
              selectedIndex={searchSel}
              onHover={setSearchSel}
              onOpen={openSearchResult}
            />
          ) : openFilePath ? (
            <FileViewer
              ref={fileViewerRef}
              path={openFilePath}
              refreshSeq={refreshSeq}
              onOpenFile={handleOpenFile}
            />
          ) : (
            <DirListing
              path={currentDir}
              data={narrowListing.data}
              loading={narrowListing.loading}
              error={narrowListing.error}
              cursorPath={cursorPath}
              onOpenFile={handleOpenFile}
              onEnterDir={(path) => setCurrentDir(sessionId, path)}
              onRetry={() => setRefreshSeq((seq) => seq + 1)}
            />
          )}
        </div>
      )}
    </section>
  );
}
