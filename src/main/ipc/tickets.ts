import { ipcMain } from 'electron';
import type { DaemonResult, KanbanTicket } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerTicketsIpc(): void {
  ipcMain.handle('tickets:list', async (): Promise<DaemonResult<KanbanTicket[]>> => {
    const result = await daemonFetch<{ tickets: KanbanTicket[] }>('/api/tickets');
    if (result.httpStatus === 0 || result.httpStatus === 404) {
      return {
        httpStatus: 200,
        envelope: { data: [], error: null, logs: [], commands: [], meta: { request_id: '' } },
      };
    }
    const tickets =
      (result.envelope.data as { tickets: KanbanTicket[] } | null)?.tickets ?? [];
    return { httpStatus: result.httpStatus, envelope: { ...result.envelope, data: tickets } };
  });
}
