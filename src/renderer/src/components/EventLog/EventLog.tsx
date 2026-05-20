import * as React from 'react';
import styles from './EventLog.module.css';

export type EventStatus = 'starting' | 'working' | 'idle' | 'awaiting_input' | 'error' | 'ended';

export interface SessionEvent {
  id: string;
  session_intent_id: string;
  seq: number;
  type: 'status';
  status: EventStatus;
  tool?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  raw?: unknown;
  at: string;
}

export interface EventLogProps extends React.HTMLAttributes<HTMLDivElement> {
  events: SessionEvent[];
  selectedEventId?: string | null;
  // Signals EventLog to toggle expand for an event. Increment seq to trigger.
  externalToggle?: { id: string; seq: number } | null;
}

const STATUS_BADGE: Record<EventStatus, string> = {
  starting: 'INIT',
  working: 'RUN',
  idle: 'IDLE',
  awaiting_input: 'WAIT',
  error: 'ERR',
  ended: 'END',
};

function formatTime(at: string): string {
  const d = new Date(at);
  if (isNaN(d.getTime())) return at.slice(11, 19) || '';
  return d.toTimeString().slice(0, 8);
}

const StatusDot: React.FC<{ status: EventStatus }> = ({ status }) => (
  <span className={[styles.dot, styles[`dot-${status}`]].join(' ')} aria-hidden="true">
    <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
      <circle cx="3" cy="3" r="3" />
    </svg>
  </span>
);

const EventLog: React.FC<EventLogProps> = ({ events, selectedEventId, externalToggle, className, ...rest }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const lastToggleSeq = React.useRef(-1);

  React.useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [events.length]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  React.useEffect(() => {
    if (!externalToggle) return;
    if (externalToggle.seq === lastToggleSeq.current) return;
    lastToggleSeq.current = externalToggle.seq;
    toggle(externalToggle.id);
  }, [externalToggle?.seq, externalToggle?.id]);

  const rootClass = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={rootClass} ref={containerRef} {...rest}>
      {events.length === 0 ? (
        <div className={styles.empty}>no events</div>
      ) : (
        <div role="list">
          {[...events].reverse().map(ev => {
            const isOpen = expanded.has(ev.id);
            const badge = ev.tool ? ev.tool.toUpperCase() : STATUS_BADGE[ev.status];
            const rowClass = [
              styles.row,
              styles[`status-${ev.status}`],
              isOpen ? styles.open : undefined,
              ev.id === selectedEventId ? styles.selected : undefined,
            ].filter(Boolean).join(' ');

            return (
              <div
                key={ev.id}
                className={rowClass}
                role="listitem"
                tabIndex={0}
                onClick={() => toggle(ev.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(ev.id);
                  }
                }}
                aria-expanded={isOpen}
              >
                <div className={styles.rowMain}>
                  <StatusDot status={ev.status} />
                  <span className={styles.badge}>{badge}</span>
                  <span className={styles.msg}>{ev.message ?? ''}</span>
                  <span className={styles.time}>{formatTime(ev.at)}</span>
                  <span className={styles.chevron} aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                  </span>
                </div>

                {isOpen && (
                  <div className={styles.detail}>
                    <div className={styles.detailGrid}>
                      <span className={styles.dk}>id</span>
                      <span className={styles.dv}>{ev.id}</span>
                      <span className={styles.dk}>session</span>
                      <span className={styles.dv}>{ev.session_intent_id}</span>
                      <span className={styles.dk}>status</span>
                      <span className={styles.dv}>{ev.status}</span>
                      {ev.tool && (
                        <>
                          <span className={styles.dk}>tool</span>
                          <span className={styles.dv}>{ev.tool}</span>
                        </>
                      )}
                      <span className={styles.dk}>at</span>
                      <span className={styles.dv}>{ev.at}</span>
                      {ev.metadata != null && (
                        <>
                          <span className={styles.dk}>metadata</span>
                          <pre className={styles.pre}>{JSON.stringify(ev.metadata, null, 2)}</pre>
                        </>
                      )}
                      {ev.raw != null && (
                        <>
                          <span className={styles.dk}>raw</span>
                          <pre className={styles.pre}>{JSON.stringify(ev.raw, null, 2)}</pre>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EventLog;
