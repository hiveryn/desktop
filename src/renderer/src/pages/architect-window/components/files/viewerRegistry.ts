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
}

// Viewer dispatch by classified kind. Future kinds (image, pdf) are one
// classify branch + one entry here.
export const viewerRegistry = new Map<ViewerKind, ComponentType<ViewerProps>>([
  ['markdown', MarkdownViewer],
  ['code', CodeViewer],
  ['image', ImageViewer],
  ['binary', BinaryNote],
]);
