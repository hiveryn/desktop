import { ipcMain } from 'electron';
import type {
  DaemonResult,
  Ticket,
  TicketBoard,
  TicketCreateInput,
  TicketDeleteResult,
  TicketEditInput,
  TicketMetadataInput,
  TicketStatus,
} from '../../shared/types';
import { daemonFetch } from '../daemon/client';

function ticketCollectionPath(key: string): string {
  return `/api/architects/${encodeURIComponent(key)}/tickets`;
}

function ticketPath(key: string, id: string): string {
  return `${ticketCollectionPath(key)}/${encodeURIComponent(id)}`;
}

export function registerTicketsIpc(): void {
  ipcMain.handle(
    'tickets:list',
    async (_event, key: string): Promise<DaemonResult<TicketBoard>> => {
      return daemonFetch<TicketBoard>(ticketCollectionPath(key));
    },
  );

  ipcMain.handle(
    'tickets:get',
    async (_event, key: string, id: string): Promise<DaemonResult<Ticket>> => {
      return daemonFetch<Ticket>(ticketPath(key, id));
    },
  );

  ipcMain.handle(
    'tickets:edit',
    async (
      _event,
      key: string,
      id: string,
      input: TicketEditInput,
    ): Promise<DaemonResult<Ticket>> => {
      return daemonFetch<Ticket>(ticketPath(key, id), {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
  );

  ipcMain.handle(
    'tickets:updateMetadata',
    async (
      _event,
      key: string,
      id: string,
      input: TicketMetadataInput,
    ): Promise<DaemonResult<Ticket>> => {
      return daemonFetch<Ticket>(`${ticketPath(key, id)}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
  );

  ipcMain.handle(
    'tickets:move',
    async (_event, key: string, id: string, to: TicketStatus): Promise<DaemonResult<Ticket>> => {
      return daemonFetch<Ticket>(`${ticketPath(key, id)}/move?to=${encodeURIComponent(to)}`, {
        method: 'POST',
      });
    },
  );

  ipcMain.handle(
    'tickets:delete',
    async (_event, key: string, id: string): Promise<DaemonResult<TicketDeleteResult>> => {
      return daemonFetch<TicketDeleteResult>(ticketPath(key, id), { method: 'DELETE' });
    },
  );

  ipcMain.handle(
    'tickets:create',
    async (_event, key: string, input: TicketCreateInput): Promise<DaemonResult<Ticket>> => {
      return daemonFetch<Ticket>(ticketCollectionPath(key), {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  );
}
