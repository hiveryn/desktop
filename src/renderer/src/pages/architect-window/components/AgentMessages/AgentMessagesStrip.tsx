import * as React from 'react';
import { useAgentMessages } from '../../hooks/useAgentMessages';
import styles from './AgentMessagesStrip.module.css';
import { agentMessageViews } from './agentMessagesModel';

const TONE_LABEL = { waiting: 'waiting', retrying: 'retrying', failed: 'failed' } as const;

interface Props {
  architectKey: string;
}

// Delivery status of the project's agent messages (ticket-conclusion notices
// to the architect). Renders nothing while every message is delivered or
// progressing; a message that is held, redelivered or failed shows its reason.
export default function AgentMessagesStrip({ architectKey }: Props) {
  const messages = useAgentMessages(architectKey);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const views = React.useMemo(() => agentMessageViews(messages, now), [messages, now]);
  if (views.length === 0) return null;
  return (
    <ul className={styles.strip} aria-label="Agent message delivery">
      {views.map((view) => (
        <li key={view.id} className={styles.row} data-tone={view.tone} title={view.detail}>
          <span className={styles.tone}>{TONE_LABEL[view.tone]}</span>
          <span className={styles.label}>{view.label}</span>
          <span className={styles.detail}>{view.detail}</span>
        </li>
      ))}
    </ul>
  );
}
