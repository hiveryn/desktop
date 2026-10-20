import type { AgentMessage, AgentMessageList } from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type { Architect, ArchitectStatus, DaemonResult } from '../../shared/types';
import * as architectEvents from '../daemon/architect-events';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, ok, withData, withNullData } from './results';

interface ArchitectListPayload {
  architects: Architect[];
}

interface ArchitectStatusPayload {
  architects: ArchitectStatus[];
}

export function registerArchitectsIpc(): void {
  ipcMain.handle('architects:list', async (): Promise<DaemonResult<Architect[]>> => {
    const result = await daemonFetch<ArchitectListPayload>('/api/architects');
    if (result.envelope.error) {
      return withNullData(result);
    }
    if (!Array.isArray(result.envelope.data?.architects)) {
      return invalidDaemonResponse('architects:list returned missing architects array');
    }
    return withData(result, result.envelope.data.architects);
  });

  ipcMain.handle('architects:status', async (): Promise<DaemonResult<ArchitectStatus[]>> => {
    const result = await daemonFetch<ArchitectStatusPayload>('/api/architects/status');
    if (result.envelope.error) {
      return withNullData(result);
    }
    if (!Array.isArray(result.envelope.data?.architects)) {
      return invalidDaemonResponse('architects:status returned missing architects array');
    }
    return withData(result, result.envelope.data.architects);
  });

  ipcMain.handle(
    'architects:get',
    async (_event, key: string): Promise<DaemonResult<Architect>> => {
      return daemonFetch<Architect>(`/api/architects/${encodeURIComponent(key)}`);
    },
  );

  // The project's agent messages (ticket-conclusion notices and later kinds)
  // with their delivery state and condition.
  ipcMain.handle(
    'architects:messages',
    async (_event, key: string): Promise<DaemonResult<AgentMessage[]>> => {
      const result = await daemonFetch<AgentMessageList>(
        `/api/architects/${encodeURIComponent(key)}/messages`,
      );
      if (result.envelope.error) {
        return withNullData(result);
      }
      if (!Array.isArray(result.envelope.data?.messages)) {
        return invalidDaemonResponse('architects:messages returned missing messages array');
      }
      return withData(result, result.envelope.data.messages);
    },
  );

  ipcMain.handle('architects:events:subscribe', (event, key: string): DaemonResult<null> => {
    architectEvents.subscribe(event.sender, key);
    return ok(null);
  });

  ipcMain.handle('architects:events:unsubscribe', (event, key: string): DaemonResult<null> => {
    architectEvents.unsubscribe(event.sender.id, key);
    return ok(null);
  });
}
