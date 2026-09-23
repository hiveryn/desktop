import { useEffect } from 'react';
import { useErrorCenterStore } from '../state/errorCenterStore';

const CHANNEL_TITLES: Record<string, string> = {
  'config:shortcuts': 'Shortcut Config',
  'config:desktop': 'Desktop Config',
  'tickets:list': 'Tickets',
  'tickets:get': 'Ticket',
  'tickets:edit': 'Ticket',
  'tickets:updateMetadata': 'Ticket',
  'tickets:move': 'Ticket',
  'tickets:delete': 'Ticket',
  'tickets:create': 'Ticket',
  'sessions:list': 'Sessions',
  'sessions:create': 'Session',
  'sessions:createRun': 'Session',
  'sessions:conclude': 'Session',
  'sessions:discard': 'Session',
  'sessions:approve-intent': 'Session',
  'sessions:deny-intent': 'Session',
  'sessions:getTicket': 'Ticket',
  'architects:list': 'Architects',
  'architects:get': 'Architect',
  'architects:status': 'Architects',
  'terminals:list': 'Terminal',
  'terminals:create': 'Terminal',
  'terminals:kill': 'Terminal',
  'session:connect': 'Terminal',
  'launcher:open-architect': 'Launcher',
  'fs:listDir': 'File Explorer',
  'fs:readFile': 'File Explorer',
  'fs:pickDirectory': 'File Explorer',
};

interface PushableEntry {
  title: string;
  message: string;
  timestamp: number;
  requestId?: string;
  code?: string;
  details?: Record<string, unknown> | null;
  stacktrace?: string;
}

function push(entry: PushableEntry): void {
  useErrorCenterStore.getState().pushError(entry);
}

// Mounted once per architect window. Bridges the two currently-silent error
// sources (daemon/API envelope errors via the existing onRequest plumbing,
// and main-process SSE/WS failures via errors:infra-event) into the error
// center. Daemon-unreachable is handled in useDaemonRecovery, which already
// tracks the health-status transition this would otherwise duplicate.
export function useErrorCenterCapture(): void {
  useEffect(() => {
    const unsubscribeRequest = window.hiveryn.daemon.onRequest((entry) => {
      if (!entry.envelope.error) return;
      push({
        title: CHANNEL_TITLES[entry.channel] ?? entry.channel,
        message: entry.envelope.error.message,
        requestId: entry.envelope.meta?.request_id,
        code: entry.envelope.error.code,
        details: entry.envelope.error.details,
        stacktrace: entry.envelope.error.stacktrace,
        timestamp: Date.now(),
      });
    });

    const unsubscribeInfra = window.hiveryn.errors.onInfraEvent((event) => {
      push({
        title: event.source,
        message: event.message,
        details: event.details,
        timestamp: event.timestamp,
      });
    });

    return () => {
      unsubscribeRequest();
      unsubscribeInfra();
    };
  }, []);
}
