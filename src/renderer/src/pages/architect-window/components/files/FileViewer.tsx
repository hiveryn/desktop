import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { classify, formatBytes } from './classify';
import styles from './FileViewer.module.css';
import { useFileContent } from './useFileContent';
import { type CodeEditorHandle, viewerRegistry } from './viewerRegistry';

interface Props {
  path: string;
  refreshSeq: number;
  onOpenFile?(path: string): void;
}

export interface FileViewerHandle {
  scrollHalfPage(direction: 'up' | 'down'): void;
  /** Focus the embedded editor. No-op when the open file isn't editable. */
  focusEditor(): void;
  /** Trigger a save on the embedded editor. Returns false when there is none. */
  saveEditor(): boolean;
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

const FileViewer = forwardRef<FileViewerHandle, Props>(function FileViewer(
  { path, refreshSeq, onOpenFile },
  ref,
) {
  const { data, loading, error } = useFileContent(path, refreshSeq);
  const classified = useMemo(() => (data ? classify(data) : null), [data]);
  const scrollNodeRef = useRef<HTMLElement | null>(null);
  const editorHandleRef = useRef<CodeEditorHandle | null>(null);
  const [dirty, setDirty] = useState(false);

  const setEditorHandle = useCallback((handle: CodeEditorHandle | null) => {
    editorHandleRef.current = handle;
    // Editor unmounted (switched to a non-code file) — nothing dirty to show.
    if (handle === null) setDirty(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollHalfPage(direction) {
        const node = scrollNodeRef.current;
        if (!node) return;
        node.scrollBy({ top: (direction === 'down' ? 1 : -1) * node.clientHeight * 0.5 });
      },
      focusEditor() {
        editorHandleRef.current?.focus();
      },
      saveEditor() {
        if (!editorHandleRef.current) return false;
        void editorHandleRef.current.save();
        return true;
      },
    }),
    [],
  );

  if (error) {
    return <div className={styles.message}>Failed to load file — see error center</div>;
  }
  if (!data || !classified) {
    return loading ? <div className={styles.message}>Loading file…</div> : null;
  }

  const Viewer = viewerRegistry.get(classified.kind);
  if (!Viewer) {
    throw new Error(`No viewer registered for kind "${classified.kind}" (${path})`);
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.header}>
        <span className={styles.name} title={path}>
          {fileName(path)}
        </span>
        {dirty && (
          <span className={styles.dirtyDot} title="Unsaved changes — :w or Cmd+S to save">
            ●
          </span>
        )}
        <span className={styles.meta}>
          {data.contentType} · {formatBytes(data.size)}
        </span>
      </div>
      {data.truncated && classified.text !== null && (
        <div className={styles.truncatedBanner}>
          Showing the first {formatBytes(data.bytes.byteLength)} of {formatBytes(data.size)} — the
          daemon caps file reads at 2 MiB.
        </div>
      )}
      <div className={styles.body}>
        <Viewer
          file={data}
          text={classified.text}
          language={classified.language}
          onOpenFile={onOpenFile}
          scrollRef={(node) => {
            scrollNodeRef.current = node;
          }}
          editorRef={setEditorHandle}
          onDirtyChange={setDirty}
        />
      </div>
    </div>
  );
});

export default FileViewer;
