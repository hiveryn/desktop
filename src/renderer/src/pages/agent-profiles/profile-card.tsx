import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AGENT_KIND_ICONS, argsSummary, KIND_STYLES } from './schema';

export function AgentKindBadge({ kind }: { kind: string }): React.JSX.Element {
  const Icon = AGENT_KIND_ICONS[kind as keyof typeof AGENT_KIND_ICONS];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        KIND_STYLES[kind] ?? '',
      )}
    >
      {Icon && <Icon size={11} />}
      {kind}
    </span>
  );
}

interface ProfileCardProps {
  profile: AgentProfile;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

export function ProfileCard({
  profile: p,
  isConfirmingDelete,
  isDeleting,
  onEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: ProfileCardProps): React.JSX.Element {
  const envCount = Object.keys(p.env).length;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{p.name}</span>
          <AgentKindBadge kind={p.agent_kind} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {argsSummary(p.args)}
          {envCount > 0 && ` · ${envCount} env var${envCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isConfirmingDelete ? (
          <>
            <span className="mr-1 text-xs text-muted-foreground">Delete?</span>
            <Button size="sm" variant="destructive" disabled={isDeleting} onClick={onDeleteConfirm}>
              Yes
            </Button>
            <Button size="sm" variant="ghost" onClick={onDeleteCancel}>
              No
            </Button>
          </>
        ) : (
          <>
            <Button size="icon-sm" variant="ghost" title="Edit" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Delete"
              className="text-destructive hover:text-destructive"
              onClick={onDeleteRequest}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
