import { ipcMain } from 'electron';
import type { RendererLogPayload } from '../../shared/types';
import { writeRendererLog } from '../logging';

export function registerLogsIpc(): void {
  ipcMain.on('logs:renderer', (_event, entry: RendererLogPayload) => {
    writeRendererLog(entry);
  });
}
