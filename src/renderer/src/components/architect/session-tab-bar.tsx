import { Bot, Code2, Plus, SquareTerminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentKind, Session, SessionStatus } from './types';

const STATUS_DOT: Record<SessionStatus, string> = {
  running: 'bg-green-500',
  idle:    'bg-muted-foreground/40',
  error:   'bg-destructive',
};

const AGENT_ICON: Record<AgentKind, React.ElementType> = {
  claude:   Bot,
  opencode: Code2,
  codex:    SquareTerminal,
};

interface SessionTabBarProps {
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function SessionTabBar({
  sessions,
  activeId,
  onSelect,
  onNew,
}: SessionTabBarProps): React.JSX.Element {
  return (
    <div className="flex h-9 shrink-0 items-end gap-0 border-b border-border bg-card px-2">
      {sessions.map((s) => {
        const active = s.id === activeId;
        const AgentIcon = AGENT_ICON[s.agentKind];
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              'group relative flex h-8 items-center gap-1.5 border-b-2 px-3 transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[s.status])} />
            <AgentIcon className="size-3 shrink-0" />
            <span className="data-meta font-medium">{s.label}</span>
          </button>
        );
      })}
      <button
        onClick={onNew}
        className="ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
        title="New session"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
