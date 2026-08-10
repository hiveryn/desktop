import type { ComponentType } from 'react';
import type { FsFileResponse } from '../../../../../../shared/types';
import type { ViewerKind } from './classify';
import BinaryNote from './viewers/BinaryNote';
import CodeEditor from './viewers/CodeEditor';
import ImageViewer from './viewers/ImageViewer';
import MarkdownViewer from './viewers/MarkdownViewer';

// Imperative surface an editor-capable viewer reports up to FileViewer so
// pane-level shortcuts (focus editor, Cmd-S) can reach into it.
export interface CodeEditorHandle {
  focus(): void;
  /** Resolves true when the buffer ends up clean (saved, or nothing to save). */
  save(): Promise<boolean>;
}

export interface ViewerProps {
  file: FsFileResponse;
  // Decoded UTF-8 text for markdown/code viewers; null for binary.
  text: string | null;
  language?: string;
  // Open another file in the explorer (e.g. a relative markdown link).
  onOpenFile?(path: string): void;
  // Reports the viewer's scrollable root node (or null on unmount) so
  // FileViewer can drive Shift+J/Shift+K half-page scrolling. Attached to
  // whichever element each viewer already scrolls internally.
  scrollRef?(node: HTMLElement | null): void;
  // Editor-capable viewers report their handle (null on unmount) and dirty
  // transitions here; read-only viewers ignore both.
  editorRef?(handle: CodeEditorHandle | null): void;
  onDirtyChange?(dirty: boolean): void;
  // Scroll the editor to a 1-based line (content-search results). `seq`
  // disambiguates repeated reveals of the same line; non-editor viewers ignore it.
  reveal?: { line: number; seq: number } | null;
  // Editor cursor position (1-based), null when the editor unmounts.
  onCursorChange?(pos: { line: number; col: number } | null): void;
  // Soft-wrap long lines in the editor.
  wordWrap?: boolean;
}

// Viewer dispatch by classified kind. Future kinds (image, pdf) are one
// classify branch + one entry here. 'code' is the editable CodeMirror editor;
// MarkdownViewer embeds the same editor for its source mode.
export const viewerRegistry = new Map<ViewerKind, ComponentType<ViewerProps>>([
  ['markdown', MarkdownViewer],
  ['code', CodeEditor],
  ['image', ImageViewer],
  ['binary', BinaryNote],
]);
