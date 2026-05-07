import {
  Columns,
  FileText,
  FolderOpen,
  GitBranch,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextTab } from './types';

const CONTEXT_ICONS: Record<ContextTab, { icon: React.ElementType; label: string }> = {
  kanban:   { icon: Columns,   label: 'Board'    },
  diff:     { icon: GitBranch, label: 'Diff'     },
  files:    { icon: FolderOpen,label: 'Explorer' },
  terminal: { icon: Terminal,  label: 'Terminal' },
  ticket:   { icon: FileText,  label: 'Ticket'   },
};

interface IconRailProps {
  tabs: ContextTab[];
  active: ContextTab;
  onSelect: (tab: ContextTab) => void;
}

export function IconRail({ tabs, active, onSelect }: IconRailProps): React.JSX.Element {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-0.5 border-l border-border bg-card py-2">
      {tabs.map((tab) => {
        const { icon: Icon, label } = CONTEXT_ICONS[tab];
        const isActive = tab === active;
        return (
          <button
            key={tab}
            title={label}
            onClick={() => onSelect(tab)}
            className={cn(
              'relative flex size-8 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground/50 hover:bg-accent hover:text-foreground',
            )}
          >
            {isActive && (
              <span className="absolute bottom-1.5 right-0 top-1.5 w-[2px] rounded-l-full bg-primary" />
            )}
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
