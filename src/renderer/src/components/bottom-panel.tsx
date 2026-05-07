import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GitBranch,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  applyTheme,
  readStoredTheme,
  THEME_GROUPS,
  THEMES,
  type AppTheme,
  type ThemeGroup,
} from '@/lib/themes';

function dotColor(status: number): string {
  if (status === 0) return 'bg-yellow-500';
  if (status < 300) return 'bg-green-500';
  return 'bg-destructive';
}

function statusColor(status: number): string {
  if (status === 0) return 'text-yellow-500';
  if (status < 300) return 'text-green-500';
  return 'text-destructive';
}

function logLevelColor(level: string): string {
  if (level === 'error') return 'text-destructive';
  if (level === 'warn') return 'text-yellow-500';
  return 'text-muted-foreground';
}

function Swatch({ value, active }: { value: string; active?: boolean }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-block size-3 shrink-0 rounded-[3px] border',
        active ? 'border-primary/60' : 'border-white/10',
      )}
      style={{ background: value }}
    />
  );
}

export function ThemeButton(): React.JSX.Element {
  const [theme, setTheme] = useState<AppTheme>(
    () =>
      readStoredTheme() ??
      ((document.documentElement.getAttribute('data-theme') as AppTheme) ?? 'dark'),
  );
  const [open, setOpen] = useState(false);
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[1];

  function handleSelect(next: AppTheme): void {
    setTheme(next);
    applyTheme(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex h-full items-center gap-1.5 border-l border-border px-3',
            'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            open && 'bg-accent text-foreground',
          )}
          aria-label="Switch theme"
        >
          <Swatch value={current.swatch} active />
          <span className="font-mono text-[11px]">{current.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 overflow-hidden p-0">
        <ScrollArea className="max-h-[420px]">
          <div className="p-2">
            {(Object.keys(THEME_GROUPS) as ThemeGroup[]).map((group) => {
              const items = THEMES.filter((t) => t.group === group);
              return (
                <div key={group} className="mb-1">
                  <p className="label-section px-2 py-1">{THEME_GROUPS[group]}</p>
                  {items.map(({ value, label, swatch }) => (
                    <button
                      key={value}
                      onClick={() => handleSelect(value)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5',
                        'transition-colors hover:bg-accent hover:text-accent-foreground',
                        theme === value && 'bg-accent/60',
                      )}
                    >
                      <Swatch value={swatch} active={theme === value} />
                      <span className="data-meta flex-1">{label}</span>
                      {theme === value && (
                        <Check className="ml-auto size-3 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface LogPanelProps {
  entries: RequestLogEntry[];
  onClear: () => void;
  onClose: () => void;
}

function LogPanel({ entries, onClear, onClose }: LogPanelProps): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStackId, setExpandedStackId] = useState<string | null>(null);

  return (
    <div className="flex h-52 flex-col border-t border-border bg-card">
      <div className="flex h-7 shrink-0 items-center border-b border-border/50 px-3">
        <span className="label-section">Daemon requests</span>
        {entries.length > 0 && (
          <span className="data-meta ml-2 opacity-40">{entries.length}</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {entries.length > 0 && (
            <button
              onClick={onClear}
              title="Clear"
              className="flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <Trash2 className="size-3" />
            </button>
          )}
          <button
            onClick={onClose}
            title="Collapse"
            className="flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <ChevronDown className="size-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-none">
        {entries.length === 0 && (
          <p className="px-3 py-3 text-muted-foreground/50">No requests yet.</p>
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
            <div key={entry.id} className="border-b border-border/30 last:border-0">
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
                <span className={cn('size-1.5 shrink-0 rounded-full', dotColor(entry.httpStatus))} />
                <span className="w-14 shrink-0 text-muted-foreground">{entry.method}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{entry.path}</span>
                <span className={cn('w-8 shrink-0 tabular-nums', statusColor(entry.httpStatus))}>
                  {entry.httpStatus || 'ERR'}
                </span>
                <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
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

              {isExpanded && entry.envelope.error && (
                <div className="space-y-1.5 border-t border-border/40 bg-destructive/5 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-destructive">
                      {entry.envelope.error.code}
                    </span>
                    {entry.envelope.meta.request_id && (
                      <span className="text-muted-foreground">{entry.envelope.meta.request_id}</span>
                    )}
                  </div>
                  <p className="text-foreground">{entry.envelope.error.message}</p>
                  {entry.envelope.error.details &&
                    Object.keys(entry.envelope.error.details).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(entry.envelope.error.details).map(([k, v]) => (
                          <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
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
    </div>
  );
}

interface BottomPanelProps {
  logOpen: boolean;
  onLogOpenChange: (open: boolean) => void;
}

export function BottomPanel({ logOpen, onLogOpenChange }: BottomPanelProps): React.JSX.Element {
  const [entries, setEntries] = useState<RequestLogEntry[]>([]);

  useEffect(() => {
    return window.hiveryn.daemon.onRequest((entry) => {
      setEntries((prev) => [entry, ...prev].slice(0, 200));
      if (entry.httpStatus >= 400 || entry.httpStatus === 0) {
        onLogOpenChange(true);
      }
    });
  }, [onLogOpenChange]);

  const errorCount = entries.filter((e) => e.httpStatus >= 400 || e.httpStatus === 0).length;

  function daemonDot(): string {
    if (entries.length === 0) return 'bg-muted-foreground/30';
    if (errorCount > 0) return 'bg-destructive';
    return 'bg-green-500';
  }

  return (
    <div className="flex shrink-0 flex-col">
      {logOpen && (
        <LogPanel
          entries={entries}
          onClear={() => setEntries([])}
          onClose={() => onLogOpenChange(false)}
        />
      )}

      <div className="flex h-[22px] shrink-0 items-stretch border-t border-border bg-card text-[11px]">
        <button
          onClick={() => onLogOpenChange(!logOpen)}
          className={cn(
            'flex items-center gap-1.5 border-r border-border px-3',
            'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            logOpen && 'bg-accent/50 text-foreground',
          )}
          aria-label={logOpen ? 'Collapse daemon log' : 'Expand daemon log'}
        >
          <Activity className="size-3 shrink-0" />
          <span className="font-mono">daemon</span>
          <span className={cn('size-1.5 rounded-full', daemonDot())} />
          {errorCount > 0 && (
            <span className="rounded-full bg-destructive px-1 font-semibold leading-4 text-[9px] text-white">
              {errorCount}
            </span>
          )}
          {entries.length > 0 && errorCount === 0 && (
            <span className="font-mono text-[10px] text-muted-foreground/50">{entries.length}</span>
          )}
          <ChevronUp
            className={cn('size-2.5 shrink-0 transition-transform', logOpen && 'rotate-180')}
          />
        </button>

        <div className="flex items-center gap-1.5 border-r border-border px-3 text-muted-foreground">
          <GitBranch className="size-3 shrink-0" />
          <span className="font-mono">main</span>
        </div>

        <div className="flex-1" />

        <ThemeButton />
      </div>
    </div>
  );
}
