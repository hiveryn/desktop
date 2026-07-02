import { useEffect } from 'react';
import { useErrorCenterStore } from '../state/errorCenterStore';
import { useToastStore } from '../state/toastStore';

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
  'sessions:createFreeform': 'Session',
  'sessions:conclude': 'Session',
  'sessions:discard': 'Session',
  'sessions:approve-conclusion': 'Session',
  'sessions:reject-conclusion': 'Session',
  'sessions:getTicket': 'Ticket',
  'architects:list': 'Architects',
  'architects:get': 'Architect',
  'architects:status': 'Architects',
  'terminals:list': 'Terminal',
  'terminals:create': 'Terminal',
  'terminals:kill': 'Terminal',
  'session:connect': 'Terminal',
  'launcher:open-architect': 'Launcher',
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
  useToastStore.getState().pushToast({ title: entry.title, message: entry.message });
}

// Mounted once per architect window. Bridges the two currently-silent error
// sources (daemon/API envelope errors via the existing onRequest plumbing,
// and main-process SSE/WS failures via errors:infra-event) into the error
// center + toast stores. Daemon-unreachable is handled in useDaemonRecovery,
// which already tracks the health-status transition this would otherwise
// duplicate.
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
