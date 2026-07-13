import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState, type Extension, type Text } from '@codemirror/state';
import { drawSelection, EditorView, keymap, lineNumbers, type ViewUpdate } from '@codemirror/view';
import { Vim, vim } from '@replit/codemirror-vim';
import { useEffect, useRef, useState } from 'react';
import { dropEditorBuffer, getEditorBuffer, putEditorBuffer } from '../editorBuffers';
import type { ViewerProps } from '../viewerRegistry';
import { editorTheme } from './cmTheme';
import styles from './Viewers.module.css';

// EditorStates are cached across navigation (editorBuffers) and outlive any
// single React mount of this component, so their extension closures must not
// capture component state. Everything instance-coupled — save, blur-to-tree,
// dirty tracking — resolves through this per-view controller registry at
// event time, and the compartments are module-level so a restored state can
// still be reconfigured.
interface EditorController {
  save(): Promise<boolean>;
  close(): void;
  onUpdate(update: ViewUpdate): void;
}

const controllers = new WeakMap<EditorView, EditorController>();
const languageCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

// The Vim ex-command registry is a module singleton; route to the controller
// of whichever view issued the command. `:w` overrides the built-in write
// (which expects a CM5-style save command); `:q`/`:wq` have no built-in.
Vim.defineEx('write', 'w', (cm) => {
  void controllers.get(cm.cm6)?.save();
});
Vim.defineEx('quit', 'q', (cm) => {
  controllers.get(cm.cm6)?.close();
});
Vim.defineEx('wq', 'wq', (cm) => {
  const controller = controllers.get(cm.cm6);
  if (!controller) return;
  void controller.save().then((saved) => {
    if (saved) controller.close();
  });
});

function buildExtensions(): Extension[] {
  return [
    // vim() must precede the other keymaps so it sees keys first.
    vim({ status: true }),
    lineNumbers(),
    drawSelection(),
    history(),
    keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          void controllers.get(view)?.save();
          return true;
        },
      },
      // Escape only reaches this keymap when the vim plugin leaves it
      // unhandled — normal mode with nothing pending — which is exactly the
      // "hand focus back to the explorer tree" gesture.
      {
        key: 'Escape',
        run: (view) => {
          controllers.get(view)?.close();
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => controllers.get(update.view)?.onUpdate(update)),
    editorTheme,
    languageCompartment.of([]),
    readOnlyCompartment.of(EditorState.readOnly.of(false)),
  ];
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export default function CodeEditor({
  file,
  text,
  scrollRef,
  editorRef,
  onDirtyChange,
}: ViewerProps) {
  if (text === null) {
    throw new Error(`CodeEditor requires decoded text for ${file.path}`);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Last (path, fetched text) applied to the view — the sync effect below
  // uses it to tell "new file" from "same file refetched" from "no-op render".
  const loadedRef = useRef<{ path: string; fetchedText: string } | null>(null);
  // Dirty baseline: doc content as of the last load-from-disk or save.
  const baseTextRef = useRef('');
  const baseDocRef = useRef<Text | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  // Latest content fetched from disk — what "Reload from disk" restores.
  const diskTextRef = useRef('');
  const truncatedRef = useRef(file.truncated);
  truncatedRef.current = file.truncated;

  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const scrollRefRef = useRef(scrollRef);
  scrollRefRef.current = scrollRef;
  const editorRefRef = useRef(editorRef);
  editorRefRef.current = editorRef;

  const setDirty = (dirty: boolean): void => {
    if (dirty === dirtyRef.current) return;
    dirtyRef.current = dirty;
    onDirtyChangeRef.current?.(dirty);
  };

  const applyLanguage = (view: EditorView, path: string): void => {
    const desc = LanguageDescription.matchFilename(languages, fileName(path));
    if (!desc) {
      view.dispatch({ effects: languageCompartment.reconfigure([]) });
      return;
    }
    // load() memoizes per description; the guards drop the result if the
    // editor moved on to another file while the language chunk loaded.
    void desc.load().then((support) => {
      if (viewRef.current !== view || loadedRef.current?.path !== path) return;
      view.dispatch({ effects: languageCompartment.reconfigure(support) });
    });
  };

  const applyReadOnly = (view: EditorView): void => {
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(truncatedRef.current)),
    });
  };

  const stashBuffer = (view: EditorView, path: string): void => {
    const baseDoc = baseDocRef.current;
    if (baseDoc === null) return;
    putEditorBuffer(path, {
      state: view.state,
      baseText: baseTextRef.current,
      baseDoc,
      dirty: dirtyRef.current,
    });
  };

  const loadFile = (view: EditorView, path: string, fetchedText: string): void => {
    setSaveError(null);
    const cached = getEditorBuffer(path);
    let conflictNow = false;
    if (cached && cached.baseText === fetchedText) {
      // Disk still matches the buffer's baseline — restore edits, undo
      // history, and cursor exactly as they were left.
      view.setState(cached.state);
      baseTextRef.current = cached.baseText;
      baseDocRef.current = cached.baseDoc;
      setDirty(cached.dirty);
    } else if (cached?.dirty) {
      // Disk changed underneath unsaved edits: keep the edits and surface
      // the conflict instead of silently dropping either side.
      view.setState(cached.state);
      baseTextRef.current = cached.baseText;
      baseDocRef.current = cached.baseDoc;
      setDirty(true);
      conflictNow = true;
    } else {
      view.setState(EditorState.create({ doc: fetchedText, extensions: buildExtensions() }));
      baseTextRef.current = fetchedText;
      baseDocRef.current = view.state.doc;
      setDirty(false);
    }
    loadedRef.current = { path, fetchedText };
    diskTextRef.current = fetchedText;
    setConflict(conflictNow);
    applyReadOnly(view);
    applyLanguage(view, path);
  };

  // Same path fetched again (manual refresh / tab reactivation).
  const handleRefetch = (view: EditorView, path: string, fetchedText: string): void => {
    loadedRef.current = { path, fetchedText };
    diskTextRef.current = fetchedText;
    if (fetchedText === baseTextRef.current) return;
    if (dirtyRef.current) {
      setConflict(true);
      return;
    }
    // External change with no local edits — swap the doc in place; the
    // selection maps through the change instead of resetting to the top.
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: fetchedText } });
    baseTextRef.current = fetchedText;
    baseDocRef.current = view.state.doc;
    setDirty(false);
  };

  const save = async (): Promise<boolean> => {
    const view = viewRef.current;
    const loaded = loadedRef.current;
    if (!view || !loaded || savingRef.current) return false;
    // readOnly already blocks edits for truncated reads; this is belt and
    // suspenders against ever writing a truncated buffer over the full file.
    if (truncatedRef.current) return false;
    if (!dirtyRef.current) return true;
    const doc = view.state.doc;
    const content = doc.toString();
    savingRef.current = true;
    setSaveError(null);
    try {
      await window.hiveryn.fs.writeFile(loaded.path, content);
      if (viewRef.current === view && loadedRef.current?.path === loaded.path) {
        baseTextRef.current = content;
        baseDocRef.current = doc;
        diskTextRef.current = content;
        setConflict(false);
        // The user may have kept typing while the write was in flight.
        setDirty(!view.state.doc.eq(doc));
      } else {
        // Navigated away (or unmounted) mid-save — rebase the stashed buffer.
        const buffer = getEditorBuffer(loaded.path);
        if (buffer) {
          putEditorBuffer(loaded.path, {
            ...buffer,
            baseText: content,
            baseDoc: doc,
            dirty: !buffer.state.doc.eq(doc),
          });
        }
      }
      return true;
    } catch (err) {
      const error = err as Error & { code?: string };
      setSaveError(error.code ? `${error.code}: ${error.message}` : error.message);
      return false;
    } finally {
      savingRef.current = false;
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const reloadFromDisk = (): void => {
    const view = viewRef.current;
    const loaded = loadedRef.current;
    if (!view || !loaded) return;
    dropEditorBuffer(loaded.path);
    view.setState(EditorState.create({ doc: diskTextRef.current, extensions: buildExtensions() }));
    baseTextRef.current = diskTextRef.current;
    baseDocRef.current = view.state.doc;
    setDirty(false);
    setConflict(false);
    setSaveError(null);
    applyReadOnly(view);
    applyLanguage(view, loaded.path);
  };

  // ── View lifecycle (one EditorView per mount; states swap per file) ──────
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once — setDirty/stashBuffer only touch stable refs; file syncing lives in the effect below
  useEffect(() => {
    const view = new EditorView({ parent: containerRef.current ?? undefined });
    viewRef.current = view;
    controllers.set(view, {
      save: () => saveRef.current(),
      close: () => view.contentDOM.blur(),
      onUpdate: (update) => {
        if (!update.docChanged) return;
        const baseDoc = baseDocRef.current;
        if (baseDoc === null) return;
        setDirty(!update.state.doc.eq(baseDoc));
      },
    });
    scrollRefRef.current?.(view.scrollDOM);
    editorRefRef.current?.({
      focus: () => view.focus(),
      save: () => saveRef.current(),
    });
    return () => {
      const loaded = loadedRef.current;
      if (loaded) stashBuffer(view, loaded.path);
      editorRefRef.current?.(null);
      scrollRefRef.current?.(null);
      controllers.delete(view);
      view.destroy();
      viewRef.current = null;
      loadedRef.current = null;
    };
  }, []);

  // ── Sync the view to the fetched file (path change or refetch) ───────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const loaded = loadedRef.current;
    if (loaded && loaded.path === file.path && loaded.fetchedText === text) return;
    if (loaded && loaded.path === file.path) {
      handleRefetch(view, file.path, text);
      return;
    }
    if (loaded) stashBuffer(view, loaded.path);
    loadFile(view, file.path, text);
  });

  return (
    <div className={styles.editorWrap}>
      {file.truncated && (
        <div className={styles.editorBanner} data-kind="notice">
          Read-only: this is a truncated 2 MiB prefix — editing the full file isn't possible.
        </div>
      )}
      {conflict && (
        <div className={styles.editorBanner} data-kind="conflict">
          <span className={styles.editorBannerText}>
            File changed on disk under your unsaved edits — saving will overwrite the disk version.
          </span>
          <button type="button" className={styles.editorBannerButton} onClick={reloadFromDisk}>
            Reload from disk
          </button>
          <button
            type="button"
            className={styles.editorBannerButton}
            onClick={() => setConflict(false)}
          >
            Keep my edits
          </button>
        </div>
      )}
      {saveError && (
        <div className={styles.editorBanner} data-kind="error">
          <span className={styles.editorBannerText}>Save failed: {saveError}</span>
        </div>
      )}
      <div ref={containerRef} className={styles.editor} />
    </div>
  );
}
