import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePaneLayoutStore } from '../../../../state/paneLayoutStore';
import { classify, formatBytes } from './classify';
import { getEditorBuffer } from './editorBuffers';
import styles from './FileViewer.module.css';
import { useFileContent } from './useFileContent';
import { type CodeEditorHandle, viewerRegistry } from './viewerRegistry';
import CopyButton from './viewers/CopyButton';

interface Props {
  path: string;
  refreshSeq: number;
  onOpenFile?(path: string): void;
  /** Scroll the editor to a 1-based line once the file is open (content search). */
  reveal?: { line: number; seq: number } | null;
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

const wrapIcon = (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.5 4.5h11" />
    <path d="M2.5 8h8.5a2.25 2.25 0 0 1 0 4.5H8.5" />
    <path d="M10 10.75L8.25 12.5L10 14.25" />
    <path d="M2.5 11.5h3" />
  </svg>
);

const FileViewer = forwardRef<FileViewerHandle, Props>(function FileViewer(
  { path, refreshSeq, onOpenFile, reveal },
  ref,
) {
  const { data, loading, error } = useFileContent(path, refreshSeq);
  const classified = useMemo(() => (data ? classify(data) : null), [data]);
  const scrollNodeRef = useRef<HTMLElement | null>(null);
  const editorHandleRef = useRef<CodeEditorHandle | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number } | null>(null);
  const [pathCopied, setPathCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  const wordWrap = usePaneLayoutStore((s) => s.editorWordWrap);
  const toggleWordWrap = usePaneLayoutStore((s) => s.toggleEditorWordWrap);

  const setEditorHandle = useCallback((handle: CodeEditorHandle | null) => {
    editorHandleRef.current = handle;
    // Editor unmounted (switched to a non-code file) — nothing dirty to show.
    if (handle === null) setDirty(false);
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    };
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

  const copyPath = (): void => {
    void navigator.clipboard.writeText(path).then(() => {
      setPathCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setPathCopied(false), 1500);
    });
  };

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

  // The markdown viewer hosts its own copy button inside the rendered/source
  // toggle; every other text viewer gets a standalone floating one here.
  const copyText = classified.kind !== 'markdown' ? classified.text : null;
  const editable = classified.kind === 'code' || classified.kind === 'markdown';

  return (
    <div className={styles.viewer}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.name}
          title={pathCopied ? 'Copied' : `${path} — click to copy path`}
          onClick={copyPath}
        >
          {fileName(path)}
          {pathCopied && (
            <span className={styles.copiedTag} aria-live="polite">
              copied
            </span>
          )}
        </button>
        {dirty && (
          <span className={styles.dirtyDot} title="Unsaved changes — :w or Cmd+S to save">
            ●
          </span>
        )}
        <span className={styles.meta}>
          {cursorPos && (
            <span className={styles.cursorPos}>
              {cursorPos.line}:{cursorPos.col}
            </span>
          )}
          {data.contentType} · {formatBytes(data.size)}
        </span>
        {editable && (
          <button
            type="button"
            className={styles.wrapToggle}
            data-active={wordWrap || undefined}
            title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
            aria-label="Toggle word wrap"
            aria-pressed={wordWrap}
            onClick={toggleWordWrap}
          >
            {wrapIcon}
          </button>
        )}
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
          reveal={reveal}
          onCursorChange={setCursorPos}
          wordWrap={wordWrap}
        />
        {copyText !== null && (
          <div className={styles.copyOverlay}>
            <CopyButton getText={() => getEditorBuffer(path)?.state.doc.toString() ?? copyText} />
          </div>
        )}
      </div>
    </div>
  );
});

export default FileViewer;
