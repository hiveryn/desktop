import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { KanbanTicket, Session } from './types';

const INITIAL_TICKETS: KanbanTicket[] = [
  { id: 't1', col: 'in-progress', title: 'Add architect groups, architects, and repos',   tag: 'backend',  agent: 'opencode' },
  { id: 't2', col: 'in-progress', title: 'Scaffold Electron desktop app',                 tag: 'frontend', agent: 'claude'   },
  { id: 't3', col: 'backlog',     title: 'Add session spawning IPC',                      tag: 'backend'  },
  { id: 't4', col: 'backlog',     title: 'Build launcher window (architect selector)',     tag: 'frontend' },
  { id: 't5', col: 'backlog',     title: 'Implement pty bridge for agent terminals',      tag: 'core'     },
  { id: 't6', col: 'backlog',     title: 'Wire architect groups to desktop UI',           tag: 'frontend' },
  { id: 't7', col: 'done',        title: 'Standardise daemon response envelope',          tag: 'backend'  },
  { id: 't8', col: 'done',        title: 'Add agent profile CRUD',                        tag: 'backend'  },
];

const COLS: { id: KanbanTicket['col']; label: string }[] = [
  { id: 'backlog',      label: 'Backlog'     },
  { id: 'in-progress',  label: 'In Progress' },
  { id: 'done',         label: 'Done'        },
];

interface ArchitectKanbanProps {
  onSessionCreated: (session: Session) => void;
}

export function ArchitectKanban({ onSessionCreated }: ArchitectKanbanProps): React.JSX.Element {
  const [selected, setSelected] = useState<KanbanTicket | null>(null);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [spawnTicket, setSpawnTicket] = useState<KanbanTicket | null>(null);
  const [profileId, setProfileId] = useState('');
  const [workdir, setWorkdir] = useState('');

  const { data: rawTickets } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => window.hiveryn.tickets.list(),
    retry: false,
  });
  const tickets = rawTickets && rawTickets.length > 0 ? rawTickets : INITIAL_TICKETS;

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => window.hiveryn.profiles.list(),
    enabled: spawnOpen,
  });

  const spawnMutation = useMutation({
    mutationFn: ({ pid, wd }: { pid: string; wd: string }) =>
      window.hiveryn.sessions.create(pid, wd),
    onSuccess: (session) => {
      onSessionCreated(session);
      setSpawnOpen(false);
      setSelected(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to spawn session');
    },
  });

  function openSpawn(ticket: KanbanTicket): void {
    setSpawnTicket(ticket);
    setProfileId('');
    setWorkdir('');
    setSpawnOpen(true);
  }

  function confirmSpawn(): void {
    if (!profileId) {
      toast.error('Select an agent profile');
      return;
    }
    spawnMutation.mutate({ pid: profileId, wd: workdir });
  }

  return (
    <>
      <div className="grid h-full grid-cols-3 gap-3 overflow-hidden p-4">
        {COLS.map((col) => {
          const items = tickets.filter((t) => t.col === col.id);
          return (
            <div
              key={col.id}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/20"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="label-section">{col.label}</span>
                <span className="data-num text-muted-foreground">{items.length}</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2 p-2">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className="w-full rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
                    >
                      <p className="data-meta font-medium leading-snug text-foreground">
                        {t.title}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="data-badge rounded bg-muted px-1.5 py-0.5">{t.tag}</span>
                        {t.agent && (
                          <span className="data-badge text-green-600 dark:text-green-400">
                            ● {t.agent}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      {/* Ticket detail dialog */}
      <Dialog open={!!selected && !spawnOpen} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold leading-snug">
              {selected?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2">
              <span className="data-badge rounded bg-muted px-2 py-0.5">{selected?.tag}</span>
              <span
                className={cn(
                  'data-badge rounded px-2 py-0.5 capitalize bg-primary/10 text-primary',
                )}
              >
                {selected?.col}
              </span>
            </div>
            {selected?.agent ? (
              <p className="data-meta text-muted-foreground">● Agent running: {selected.agent}</p>
            ) : (
              <p className="data-meta text-muted-foreground">No agent assigned.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
            {!selected?.agent && selected && (
              <Button size="sm" onClick={() => openSpawn(selected)}>
                <Plus className="size-3" />
                Spawn Agent
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spawn dialog */}
      <Dialog open={spawnOpen} onOpenChange={setSpawnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Spawn agent session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="data-meta text-muted-foreground">{spawnTicket?.title}</p>
            <div className="space-y-1.5">
              <Label className="data-meta">Agent profile</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select profile…" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="data-meta">Working directory</Label>
              <Input
                className="h-8 font-mono text-xs"
                placeholder="/path/to/workdir"
                value={workdir}
                onChange={(e) => setWorkdir(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSpawnOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmSpawn}
              disabled={spawnMutation.isPending}
            >
              {spawnMutation.isPending ? 'Spawning…' : 'Spawn'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
