import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface TicketData {
  title: string;
  repo: string;
  ref: string;
  agentKind: string;
  model: string;
  tasks: { done: boolean; text: string }[];
}

const MOCK_TICKETS: Record<string, TicketData> = {
  'ticket-001': {
    title: 'Add architect groups, architects, and repos — schema, domain, store, and API',
    repo: 'github.com/hiveryn/daemon',
    ref: 'ticket-001',
    agentKind: 'opencode',
    model: 'openai/gpt-5.4',
    tasks: [
      { done: true,  text: 'Create migration 0003_architect_groups.sql' },
      { done: true,  text: 'Add domain types (ArchitectGroup, Architect, Repo)' },
      { done: true,  text: 'Implement SQLite stores' },
      { done: false, text: 'Register API routes in router.go' },
      { done: false, text: 'Add validation and error mapping' },
      { done: false, text: 'Write integration tests' },
    ],
  },
};

const FALLBACK: TicketData = {
  title: 'Ticket',
  repo: '',
  ref: '',
  agentKind: 'claude',
  model: 'claude-sonnet-4-6',
  tasks: [],
};

interface TicketPaneProps {
  sessionId: string;
}

export function TicketPane({ sessionId }: TicketPaneProps): React.JSX.Element {
  const data = MOCK_TICKETS[sessionId] ?? FALLBACK;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div>
          <span className="data-badge rounded bg-primary/10 px-2 py-0.5 text-primary">
            in progress
          </span>
          <h2 className="mt-2 text-sm font-semibold">{data.title}</h2>
          {data.repo && (
            <p className="data-meta mt-1 text-muted-foreground">
              {data.repo} · {data.ref}
            </p>
          )}
        </div>
        {data.tasks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <p className="label-section">Tasks</p>
              {data.tasks.map(({ done, text }) => (
                <div key={text} className="flex items-start gap-2">
                  <span
                    className={cn(
                      'data-badge mt-0.5 shrink-0',
                      done ? 'text-green-500' : 'text-muted-foreground/40',
                    )}
                  >
                    {done ? '✓' : '○'}
                  </span>
                  <span className={cn('data-meta', done && 'line-through opacity-50')}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <Separator />
        <div className="space-y-1">
          <p className="label-section">Agent</p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="data-badge">
              {data.agentKind}
            </Badge>
            <span className="data-meta text-muted-foreground">{data.model}</span>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
