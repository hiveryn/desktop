import { Activity, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RequestLogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function dotColor(status: number): string {
  if (status === 0) return 'bg-yellow-500';
  if (status < 300) return 'bg-green-500 dark:bg-green-400';
  return 'bg-destructive';
}

function statusColor(status: number): string {
  if (status === 0) return 'text-yellow-500';
  if (status < 300) return 'text-green-600 dark:text-green-400';
  return 'text-destructive';
}

function logLevelColor(level: string): string {
  if (level === 'error') return 'text-destructive';
  if (level === 'warn') return 'text-yellow-500';
  return 'text-muted-foreground';
}

export function RequestLog({ open, onOpenChange }: RequestLogProps): React.JSX.Element {
  const [entries, setEntries] = useState<RequestLogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStackId, setExpandedStackId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return window.hiveryn.daemon.onRequest((entry) => {
      setEntries((prev) => [entry, ...prev].slice(0, 200));
      if (entry.httpStatus >= 400 || entry.httpStatus === 0) {
        onOpenChange(true);
        setExpandedId(entry.id);
      }
    });
  }, [onOpenChange]);

  function clear(): void {
    setEntries([]);
    setExpandedId(null);
    setExpandedStackId(null);
  }

  const errorCount = entries.filter((e) => e.httpStatus >= 400 || e.httpStatus === 0).length;

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col border-t border-border bg-card transition-[height] duration-200',
        open ? 'h-52' : 'h-8',
      )}
    >
      {/* Header — always visible. Left side toggles panel; action buttons on right. */}
      <div className="flex h-8 shrink-0 select-none items-center">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 px-3"
          onClick={() => onOpenChange(!open)}
        >
          <Activity className="size-3 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Daemon</span>
          {errorCount > 0 && (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {errorCount}
            </span>
          )}
          {entries.length > 0 && errorCount === 0 && (
            <span className="text-[10px] text-muted-foreground">{entries.length}</span>
          )}
        </button>
        <div className="flex items-center gap-0.5 pr-2">
          {entries.length > 0 && (
            <Button size="icon-sm" variant="ghost" className="size-6" title="Clear" onClick={clear}>
              <Trash2 className="size-3" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-6"
            title={open ? 'Collapse' : 'Expand'}
            onClick={() => onOpenChange(!open)}
          >
            <ChevronDown className={cn('size-3 transition-transform', !open && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {/* Entry list */}
      {open && (
        <div ref={listRef} className="flex-1 overflow-y-auto font-mono text-[11px] leading-none">
          {entries.length === 0 && (
            <p className="px-3 py-3 text-muted-foreground">No requests yet.</p>
          )}
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const hasError = !!entry.envelope.error;
            const time = new Date(entry.ts).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div key={entry.id} className="border-b border-border/40 last:border-0">
                {/* Compact row */}
                <button
                  type="button"
                  disabled={!hasError}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                    hasError && 'cursor-pointer hover:bg-accent/40',
                    !hasError && 'cursor-default',
                    isExpanded && 'bg-accent/20',
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <span
                    className={cn('size-1.5 shrink-0 rounded-full', dotColor(entry.httpStatus))}
                  />
                  <span className="w-[3.5rem] shrink-0 text-muted-foreground">{entry.method}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{entry.path}</span>
                  <span className={cn('w-8 shrink-0 tabular-nums', statusColor(entry.httpStatus))}>
                    {entry.httpStatus || 'ERR'}
                  </span>
                  <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                    {entry.durationMs}ms
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                    {time}
                  </span>
                  <ChevronRight
                    className={cn(
                      'size-3 shrink-0 text-muted-foreground transition-transform',
                      !hasError && 'opacity-0',
                      isExpanded && 'rotate-90',
                    )}
                  />
                </button>

                {/* Expanded error detail */}
                {isExpanded && entry.envelope.error && (
                  <div className="space-y-1.5 border-t border-border/40 bg-destructive/5 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-destructive">
                        {entry.envelope.error.code}
                      </span>
                      {entry.envelope.meta.request_id && (
                        <span className="text-muted-foreground">
                          {entry.envelope.meta.request_id}
                        </span>
                      )}
                    </div>

                    <p className="text-foreground">{entry.envelope.error.message}</p>

                    {entry.envelope.error.details &&
                      Object.keys(entry.envelope.error.details).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(entry.envelope.error.details).map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px] leading-tight"
                            >
                              {k}={v}
                            </span>
                          ))}
                        </div>
                      )}

                    {entry.envelope.error.stacktrace && (
                      <div>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setExpandedStackId(expandedStackId === entry.id ? null : entry.id)
                          }
                        >
                          <ChevronRight
                            className={cn(
                              'size-3 transition-transform',
                              expandedStackId === entry.id && 'rotate-90',
                            )}
                          />
                          stacktrace
                        </button>
                        {expandedStackId === entry.id && (
                          <pre className="mt-1 max-h-28 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed text-muted-foreground">
                            {entry.envelope.error.stacktrace}
                          </pre>
                        )}
                      </div>
                    )}

                    {entry.envelope.logs.length > 0 && (
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground">logs</span>
                        {entry.envelope.logs.map((log) => (
                          <p
                            key={`${entry.id}-${log.timestamp}-${log.message}`}
                            className={logLevelColor(log.level)}
                          >
                            [{log.level}] {log.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
