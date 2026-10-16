import type { Ticket, TicketBoard, TicketStatus } from '@hiveryn/shared/domain';
import { ipcMain } from 'electron';
import type {
  DaemonResult,
  TicketCreateInput,
  TicketDeleteResult,
  TicketEditInput,
  TicketMetadataInput,
} from '../../shared/types';
import { daemonFetch } from '../daemon/client';

// Ticket reads resolve path references, remote ones over SSH. The daemon waits
// at most 2 s for a machine (unanswered paths come back unverified), so a read
// is normally quick; this bound leaves room for that and for scanning a large
// board on a busy machine, so a slow read is not reported as a dead daemon.
const TICKET_READ_TIMEOUT_MS = 15_000;

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
      return daemonFetch<TicketBoard>(
        ticketCollectionPath(key),
        {},
        { timeoutMs: TICKET_READ_TIMEOUT_MS },
      );
    },
  );

  // The board filtered to the tickets whose title, body or conclusion
  // contains query (case-insensitive); the daemon does the matching so the
  // search covers full bodies and conclusions, not the summaries on hand.
  ipcMain.handle(
    'tickets:search',
    async (_event, key: string, query: string): Promise<DaemonResult<TicketBoard>> => {
      return daemonFetch<TicketBoard>(
        `${ticketCollectionPath(key)}?q=${encodeURIComponent(query)}`,
        {},
        { timeoutMs: TICKET_READ_TIMEOUT_MS },
      );
    },
  );

  ipcMain.handle(
    'tickets:get',
    async (_event, key: string, id: string): Promise<DaemonResult<Ticket>> => {
      return daemonFetch<Ticket>(ticketPath(key, id), {}, { timeoutMs: TICKET_READ_TIMEOUT_MS });
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
