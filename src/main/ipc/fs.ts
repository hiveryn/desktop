import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type {
  DaemonResult,
  FsContentSearchResponse,
  FsFileResponse,
  FsSearchResponse,
  FsTreeResponse,
  FsWriteResponse,
} from '../../shared/types';
import { daemonFetch, daemonFetchRaw } from '../daemon/client';
import { errorResult, ok, withData } from './results';

export function registerFsIpc(): void {
  ipcMain.handle(
    'fs:listDir',
    async (_event, path: string): Promise<DaemonResult<FsTreeResponse>> => {
      return daemonFetch<FsTreeResponse>(`/api/fs/tree?path=${encodeURIComponent(path)}`);
    },
  );

  ipcMain.handle(
    'fs:search',
    async (_event, path: string, query: string): Promise<DaemonResult<FsSearchResponse>> => {
      return daemonFetch<FsSearchResponse>(
        `/api/fs/search?path=${encodeURIComponent(path)}&q=${encodeURIComponent(query)}`,
      );
    },
  );

  ipcMain.handle(
    'fs:readFile',
    async (_event, path: string): Promise<DaemonResult<FsFileResponse>> => {
      const result = await daemonFetchRaw(`/api/fs/file?path=${encodeURIComponent(path)}`);
      return withData(result, result.envelope.data ? { path, ...result.envelope.data } : null);
    },
  );

  ipcMain.handle(
    'fs:writeFile',
    async (_event, path: string, content: string): Promise<DaemonResult<FsWriteResponse>> => {
      return daemonFetch<FsWriteResponse>(`/api/fs/file?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
    },
  );

  ipcMain.handle(
    'fs:searchContent',
    async (_event, path: string, query: string): Promise<DaemonResult<FsContentSearchResponse>> => {
      return daemonFetch<FsContentSearchResponse>(
        `/api/fs/search-content?path=${encodeURIComponent(path)}&q=${encodeURIComponent(query)}`,
      );
    },
  );

  ipcMain.handle(
    'fs:createFile',
    async (_event, path: string): Promise<DaemonResult<FsWriteResponse>> => {
      return daemonFetch<FsWriteResponse>(
        `/api/fs/file?path=${encodeURIComponent(path)}&create=true`,
        { method: 'PUT', body: JSON.stringify({ content: '' }) },
      );
    },
  );

  ipcMain.handle('fs:revealInFinder', async (_event, path: string): Promise<DaemonResult<null>> => {
    shell.showItemInFolder(path);
    return ok(null);
  });

  ipcMain.handle('fs:openExternal', async (_event, path: string): Promise<DaemonResult<null>> => {
    const openError = await shell.openPath(path);
    if (openError) {
      return errorResult('OPEN_EXTERNAL_FAILED', openError);
    }
    return ok(null);
  });

  ipcMain.handle('fs:pickDirectory', async (event): Promise<DaemonResult<string | null>> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return errorResult('NO_WINDOW', 'No browser window found for directory picker');
    }
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    // Cancel is a normal outcome, not an error.
    return ok(res.canceled ? null : (res.filePaths[0] ?? null));
  });
}
