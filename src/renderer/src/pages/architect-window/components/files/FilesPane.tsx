import { Back, Forward, IconButton, Refresh } from '@components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Architect, FsEntry } from '../../../../../../shared/types';
import type { ShortcutConfig } from '../../../../hooks/useShortcutConfig';
import { registerDynamicHandler } from '../../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../../keys/matchers';
import { useFilesStore } from '../../../../state/filesStore';
import { useSessionStore } from '../../../../state/sessionStore';
import Breadcrumb from './Breadcrumb';
import DirListing from './DirListing';
import DirTree from './DirTree';
import { joinPath, sortEntries } from './dirTreeUtils';
import styles from './FilesPane.module.css';
import FileViewer, { type FileViewerHandle } from './FileViewer';
import RootPicker, { type RootOption } from './RootPicker';
import { useDirListing } from './useDirListing';
import { useDirTreeData } from './useDirTreeData';

// Below this pane width the two-pane layout collapses into the drill-down
// single-pane mode. Self-measured — the tab framework has no width signal.
const WIDE_MIN_WIDTH = 640;

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
  /** undefined = ticket lookup still in flight; null = no ticket repo. */
  ticketRepo: string | null | undefined;
  shortcutConfig: ShortcutConfig | null;
}

export default function FilesPane({
  sessionId,
  architect,
  isActive,
  ticketRepo,
  shortcutConfig,
}: Props) {
  const customRoots = useFilesStore((s) => s.customRoots);
  const slice = useFilesStore((s) => s.bySession[sessionId]);
  const addCustomRoot = useFilesStore((s) => s.addCustomRoot);
  const setRoot = useFilesStore((s) => s.setRoot);
  const setCurrentDir = useFilesStore((s) => s.setCurrentDir);
  const setOpenFile = useFilesStore((s) => s.setOpenFile);
  const toggleExpanded = useFilesStore((s) => s.toggleExpanded);
  const setCursorPath = useFilesStore((s) => s.setCursorPath);

  const isFilesFocused = useSessionStore((s) => s.focusedPane === 'right-files');

  const roots = useMemo<RootOption[]>(
    () => [
      { id: 'workspace', label: architect.name, path: architect.path, kind: 'workspace' },
      ...(architect.repos ?? []).map(
        (repo): RootOption => ({
          id: `repo:${repo.key}`,
          label: repo.key,
          path: repo.path,
          kind: 'repo',
        }),
      ),
      ...customRoots.map(
        (root): RootOption => ({
          id: `custom:${root.path}`,
          label: root.label,
          path: root.path,
          kind: 'custom',
        }),
      ),
    ],
    [architect, customRoots],
  );

  // First time this session's tab is used, default to the ticket's repo (if
  // any) so ticket sessions open in the repo they're scoped to rather than
  // the architect workspace root.
  useEffect(() => {
    if (slice) return;
    // Ticket lookup still in flight — wait rather than locking in the
    // workspace root before we know whether this session has a repo.
    if (ticketRepo === undefined) return;
    const ticketRepoPath = ticketRepo
      ? architect.repos?.find((r) => r.key === ticketRepo)?.path
      : undefined;
    if (ticketRepoPath) {
      setRoot(sessionId, `repo:${ticketRepo}`, ticketRepoPath);
    } else {
      setRoot(sessionId, 'workspace', architect.path);
    }
  }, [slice, sessionId, architect.path, architect.repos, ticketRepo, setRoot]);

  // ── Responsive mode (self-measured; no width signal in the tab framework) ─
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setPaneWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const wide = paneWidth === null || paneWidth >= WIDE_MIN_WIDTH;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
  const { rows, nodes } = useDirTreeData(rootPath, expandedDirs, refreshSeq);
  const narrowListing = useDirListing(slice && !wide ? currentDir : null, refreshSeq);
  const narrowEntries = useMemo(
    () => sortEntries(narrowListing.data?.entries ?? []),
    [narrowListing.data],
  );

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

  const wideRef = useRef(wide);
  wideRef.current = wide;

  const handleOpenFileRef = useRef(handleOpenFile);
  handleOpenFileRef.current = handleOpenFile;

  const handleToggleDirRef = useRef(handleToggleDir);
  handleToggleDirRef.current = handleToggleDir;

  const fileViewerRef = useRef<FileViewerHandle>(null);

  useEffect(() => {
    if (!isFilesFocused) return;
    return registerDynamicHandler((e) => {
      const cfg = shortcutConfigRef.current;
      if (!cfg) return 'passthrough';
      if (e.repeat) return 'passthrough';
      if (isTextInputFocused()) return 'passthrough';
      // Modifier-bearing combos belong to global shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return 'passthrough';

      const filesCfg = cfg.files ?? {};
      const DOWN = filesCfg.down ?? 'j';
      const UP = filesCfg.up ?? 'k';
      const RIGHT = filesCfg.right ?? 'l';
      const LEFT = filesCfg.left ?? 'h';
      const SCROLL_DOWN = filesCfg['scroll-down'] ?? 'shift+j';
      const SCROLL_UP = filesCfg['scroll-up'] ?? 'shift+k';
      const REFRESH = filesCfg.refresh ?? 'r';

      if (matchesShortcut(e, REFRESH)) {
        setRefreshSeq((seq) => seq + 1);
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

      const sid = sessionIdRef.current;
      const cursor = cursorPathRef.current;

      if (wideRef.current) {
        const treeRows = rowsRef.current;

        if (matchesShortcut(e, DOWN)) {
          const idx = wrapIndex(
            treeRows.findIndex((r) => r.path === cursor),
            1,
            treeRows.length,
          );
          if (idx !== -1) setCursorPath(sid, treeRows[idx].path);
          return 'consumed';
        }
        if (matchesShortcut(e, UP)) {
          const idx = wrapIndex(
            treeRows.findIndex((r) => r.path === cursor),
            -1,
            treeRows.length,
          );
          if (idx !== -1) setCursorPath(sid, treeRows[idx].path);
          return 'consumed';
        }
        if (matchesShortcut(e, RIGHT)) {
          const row = treeRows.find((r) => r.path === cursor);
          if (row) {
            if (row.entry.kind === 'dir') {
              if (!row.expanded) handleToggleDirRef.current(row.path);
            } else {
              handleOpenFileRef.current(row.path);
            }
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

        if (matchesShortcut(e, DOWN)) {
          const idx = wrapIndex(
            entries.findIndex((en) => pathOf(en.name) === cursor),
            1,
            entries.length,
          );
          if (idx !== -1) setCursorPath(sid, pathOf(entries[idx].name));
          return 'consumed';
        }
        if (matchesShortcut(e, UP)) {
          const idx = wrapIndex(
            entries.findIndex((en) => pathOf(en.name) === cursor),
            -1,
            entries.length,
          );
          if (idx !== -1) setCursorPath(sid, pathOf(entries[idx].name));
          return 'consumed';
        }
        if (matchesShortcut(e, RIGHT)) {
          const entry = entries.find((en) => pathOf(en.name) === cursor);
          if (entry) {
            const entryPath = pathOf(entry.name);
            if (entry.kind === 'dir') setCurrentDir(sid, entryPath);
            else handleOpenFileRef.current(entryPath);
          }
          return 'consumed';
        }
        if (matchesShortcut(e, LEFT)) {
          const parent = parentDir(dir);
          if (parent !== dir) setCurrentDir(sid, parent);
          return 'consumed';
        }
      }

      return 'passthrough';
    });
  }, [isFilesFocused, setCursorPath, setCurrentDir]);

  // ── Keep the cursor row scrolled into view (wide mode; narrow mode does
  // its own equivalent inside DirListing) ───────────────────────────────────
  const rowRefsMap = useRef(new Map<string, HTMLElement>());
  const setRowRef = useCallback((path: string, node: HTMLElement | null) => {
    if (node) rowRefsMap.current.set(path, node);
    else rowRefsMap.current.delete(path);
  }, []);
  useEffect(() => {
    if (!wide || !cursorPath) return;
    rowRefsMap.current.get(cursorPath)?.scrollIntoView({ block: 'nearest' });
  }, [wide, cursorPath]);

  // ── Re-clamp the cursor whenever it points at a path that's no longer
  // visible (collapsed elsewhere, refresh reshuffle, root/dir change) ───────
  useEffect(() => {
    if (!slice) return;
    const visiblePaths = wide
      ? rows.map((r) => r.path)
      : narrowEntries.map((e) => joinPath(currentDir, e.name));
    if (cursorPath !== null && visiblePaths.includes(cursorPath)) return;
    const fallback = visiblePaths[0] ?? null;
    if (fallback !== cursorPath) setCursorPath(sessionId, fallback);
  }, [slice, wide, rows, narrowEntries, currentDir, cursorPath, sessionId, setCursorPath]);

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
            onClick={() => setSidebarCollapsed((prev) => !prev)}
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

      {wide ? (
        <div className={styles.split} data-collapsed={sidebarCollapsed || undefined}>
          <aside className={styles.sidebar}>
            <DirTree
              rootPath={rootPath}
              rows={rows}
              nodes={nodes}
              selectedPath={openFilePath}
              cursorPath={cursorPath}
              onOpenFile={handleOpenFile}
              onToggleDir={handleToggleDir}
              rowRef={setRowRef}
            />
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
          {openFilePath ? (
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
            />
          )}
        </div>
      )}
    </section>
  );
}
