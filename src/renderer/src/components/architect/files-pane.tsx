import { FileCode2, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FileNode {
  name: string;
  open?: boolean;
  new?: boolean;
  children?: FileNode[];
}

const FILE_TREE: FileNode[] = [
  {
    name: 'daemon', open: true, children: [
      { name: 'internal', open: true, children: [
        { name: 'api', open: false, children: [
          { name: 'router.go' }, { name: 'respond.go' }, { name: 'sessions.go' },
        ]},
        { name: 'domain', open: true, children: [
          { name: 'architect.go', new: true },
          { name: 'envelope.go' }, { name: 'profile.go' },
        ]},
        { name: 'store', open: true, children: [
          { name: 'migrations', open: true, children: [
            { name: '0001_initial.sql' }, { name: '0002_profiles.sql' },
            { name: '0003_architect_groups.sql', new: true },
          ]},
          { name: 'architect_groups.go', new: true },
          { name: 'profiles.go' },
        ]},
      ]},
      { name: 'cmd', open: false, children: [{ name: 'main.go' }] },
      { name: 'go.mod' }, { name: 'go.sum' },
    ],
  },
];

function FileRow({ node, depth }: { node: FileNode; depth: number }): React.JSX.Element {
  const [open, setOpen] = useState(node.open ?? false);
  const isDir = !!node.children;
  const pad = { paddingLeft: `${0.5 + depth * 1}rem` };

  if (!isDir) {
    return (
      <div
        style={pad}
        className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-[2px] hover:bg-accent"
      >
        <FileCode2 className="size-3 shrink-0 text-muted-foreground/60" />
        <span className={cn('data-meta', node.new && 'text-green-500 dark:text-green-400')}>
          {node.name}
        </span>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          style={pad}
          className="flex w-full items-center gap-1.5 rounded px-1 py-[2px] hover:bg-accent"
        >
          <FolderOpen className="size-3 shrink-0 text-muted-foreground/60" />
          <span className="data-meta font-medium">{node.name}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {node.children?.map((c) => <FileRow key={c.name} node={c} depth={depth + 1} />)}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FilesPane(): React.JSX.Element {
  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {FILE_TREE.map((n) => <FileRow key={n.name} node={n} depth={0} />)}
      </div>
    </ScrollArea>
  );
}
