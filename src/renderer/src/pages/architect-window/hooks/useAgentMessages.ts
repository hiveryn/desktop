import type { AgentMessage } from '@hiveryn/shared/domain';
import { useEffect, useState } from 'react';
import { STREAM_CONNECTED_EVENT_TYPE } from '../../../../../shared/types';

// The project's agent messages, listed on mount, on every reconnect and on
// each `agent_message_changed` event (the stream has no backlog and the event
// names no message, so the list is simply read again).
export function useAgentMessages(architectKey: string): AgentMessage[] {
  const [messages, setMessages] = useState<AgentMessage[]>([]);

  useEffect(() => {
    if (!architectKey) return;
    let cancelled = false;
    let sequence = 0;

    const load = (): void => {
      const token = ++sequence;
      window.hiveryn.architects
        .messages(architectKey)
        .then((next) => {
          if (cancelled || token !== sequence) return;
          setMessages(next);
        })
        .catch(() => {
          // Captured centrally by the request-log bridge; keep the last list.
        });
    };

    load();
    const unsubscribe = window.hiveryn.architects.subscribeEvents(architectKey, (event) => {
      if (event.type === STREAM_CONNECTED_EVENT_TYPE) {
        load();
        return;
      }
      if (event.reason === 'agent_message_changed') load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [architectKey]);

  return messages;
}
