import type { EditorState, Text } from '@codemirror/state';

// Per-path editor buffers, stashed when the editor navigates away and
// restored on return so unsaved edits, undo history, and the cursor survive
// jumping around the explorer (and across sessions — paths are absolute, so
// the same file shares one buffer everywhere). View state only; the daemon
// owns the file, this just holds what hasn't been written back yet.

export interface EditorBuffer {
  state: EditorState;
  // Doc content as of the last load-from-disk or save — the dirty baseline.
  baseText: string;
  baseDoc: Text;
  dirty: boolean;
}

// Clean buffers only exist for cursor/undo continuity; cap the cache and
// evict the oldest of them first. Dirty buffers hold unsaved work and are
// never evicted.
const MAX_BUFFERS = 32;

const buffers = new Map<string, EditorBuffer>();

export function getEditorBuffer(path: string): EditorBuffer | undefined {
  return buffers.get(path);
}

export function putEditorBuffer(path: string, buffer: EditorBuffer): void {
  // Re-insert so Map iteration order doubles as least-recently-stashed.
  buffers.delete(path);
  buffers.set(path, buffer);
  if (buffers.size <= MAX_BUFFERS) return;
  for (const [key, entry] of buffers) {
    if (!entry.dirty) {
      buffers.delete(key);
      return;
    }
  }
}

export function dropEditorBuffer(path: string): void {
  buffers.delete(path);
}
