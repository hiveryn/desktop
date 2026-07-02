import { Back, Forward, IconButton, Refresh } from '@components';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Architect } from '../../../../../../shared/types';
import { useFilesStore } from '../../../../state/filesStore';
import Breadcrumb from './Breadcrumb';
import DirListing from './DirListing';
import DirTree from './DirTree';
import styles from './FilesPane.module.css';
import FileViewer from './FileViewer';
import RootPicker, { type RootOption } from './RootPicker';

// Below this pane width the two-pane layout collapses into the drill-down
// single-pane mode. Self-measured — the tab framework has no width signal.
const WIDE_MIN_WIDTH = 640;

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

interface Props {
  sessionId: string;
  architect: Architect;
  isActive: boolean;
}

export default function FilesPane({ sessionId, architect, isActive }: Props) {
  const customRoots = useFilesStore((s) => s.customRoots);
  const slice = useFilesStore((s) => s.bySession[sessionId]);
  const addCustomRoot = useFilesStore((s) => s.addCustomRoot);
  const setRoot = useFilesStore((s) => s.setRoot);
  const setCurrentDir = useFilesStore((s) => s.setCurrentDir);
  const setOpenFile = useFilesStore((s) => s.setOpenFile);
  const toggleExpanded = useFilesStore((s) => s.toggleExpanded);

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

  // First time this session's tab is used, default to the workspace root.
  useEffect(() => {
    if (!slice) setRoot(sessionId, 'workspace', architect.path);
  }, [slice, sessionId, architect.path, setRoot]);

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

  if (!slice) return null;

  const { rootId, rootPath, currentDir, openFilePath, expandedDirs } = slice;

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
  };

  const handleBreadcrumbNavigate = (path: string): void => {
    setCurrentDir(sessionId, path);
    if (openFilePath && !openFilePath.startsWith(path.endsWith('/') ? path : `${path}/`)) {
      setOpenFile(sessionId, null);
    }
  };

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
              expandedDirs={expandedDirs}
              selectedPath={openFilePath}
              refreshSeq={refreshSeq}
              onOpenFile={handleOpenFile}
              onToggleDir={handleToggleDir}
            />
          </aside>
          <div className={styles.viewerPane}>
            {openFilePath ? (
              <FileViewer path={openFilePath} refreshSeq={refreshSeq} onOpenFile={handleOpenFile} />
            ) : (
              <div className={styles.emptyViewer}>Select a file to preview</div>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.single}>
          {openFilePath ? (
            <FileViewer path={openFilePath} refreshSeq={refreshSeq} onOpenFile={handleOpenFile} />
          ) : (
            <DirListing
              path={currentDir}
              refreshSeq={refreshSeq}
              onOpenFile={handleOpenFile}
              onEnterDir={(path) => setCurrentDir(sessionId, path)}
            />
          )}
        </div>
      )}
    </section>
  );
}
