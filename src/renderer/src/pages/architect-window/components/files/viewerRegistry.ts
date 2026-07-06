import type { ComponentType } from 'react';
import type { FsFileResponse } from '../../../../../../shared/types';
import type { ViewerKind } from './classify';
import BinaryNote from './viewers/BinaryNote';
import CodeViewer from './viewers/CodeViewer';
import ImageViewer from './viewers/ImageViewer';
import MarkdownViewer from './viewers/MarkdownViewer';

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
}

// Viewer dispatch by classified kind. Future kinds (image, pdf) are one
// classify branch + one entry here.
export const viewerRegistry = new Map<ViewerKind, ComponentType<ViewerProps>>([
  ['markdown', MarkdownViewer],
  ['code', CodeViewer],
  ['image', ImageViewer],
  ['binary', BinaryNote],
]);
