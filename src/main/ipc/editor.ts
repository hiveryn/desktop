import type { BrowserWindow } from 'electron';
import { dialog, ipcMain } from 'electron';

// Per-webContents count of unsaved editor buffers, reported one-way by the
// renderer (editorBuffers.ts) on every dirty transition. Powers the
// close-window guard below — no daemon involvement, pure Electron.
const dirtyCounts = new Map<number, number>();

export function registerEditorIpc(): void {
  ipcMain.on('editor:dirty-count', (event, count: number) => {
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      throw new Error(`editor:dirty-count received a non-numeric count: ${String(count)}`);
    }
    const wcId = event.sender.id;
    if (count <= 0) dirtyCounts.delete(wcId);
    else dirtyCounts.set(wcId, count);
    event.sender.once('destroyed', () => dirtyCounts.delete(wcId));
  });
}

// Attach the unsaved-edits close guard: closing a window whose renderer holds
// dirty editor buffers asks for confirmation instead of silently discarding
// them. Synchronous dialog — the close event only supports sync prevention.
export function guardCloseOnDirtyEditors(window: BrowserWindow): void {
  window.on('close', (e) => {
    const count = dirtyCounts.get(window.webContents.id) ?? 0;
    if (count === 0) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['Discard edits', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `${count} file${count === 1 ? ' has' : 's have'} unsaved edits`,
      detail: 'Closing this window discards them. Save with :w or Cmd+S first.',
    });
    if (choice === 1) e.preventDefault();
  });
}
