import { Plus, Settings, UserCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TitleBarProps {
  onOpenSettings: (section: 'agent-profiles' | 'appearance') => void;
}

export function TitleBar({ onOpenSettings }: TitleBarProps): React.JSX.Element {
  const [platform, setPlatform] = useState('');
  const [info, setInfo] = useState({ name: 'hiveryn', path: '/architects/hiveryn' });

  useEffect(() => {
    void window.hiveryn.app.getPlatform().then(setPlatform);
    void window.hiveryn.architect.getInfo().then(setInfo);
  }, []);

  function openLauncher(): void {
    void window.hiveryn.architect.openLauncher();
  }

  return (
    <div
      className={cn(
        'flex h-8 shrink-0 items-center border-b border-border bg-card',
        platform === 'darwin' ? 'pl-20 pr-3' : 'pl-3 pr-3',
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="data-meta text-muted-foreground/60">{info.name}</span>
      <span className="data-meta mx-1.5 text-muted-foreground/30">/</span>
      <span className="data-meta text-muted-foreground">{info.path}</span>

      <div
        className="ml-auto flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={openLauncher}
          title="New window"
          className="flex size-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          onClick={() => onOpenSettings('agent-profiles')}
          title="Agent profiles"
          className="flex size-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
        >
          <UserCircle2 className="size-3.5" />
        </button>
        <button
          onClick={() => onOpenSettings('appearance')}
          title="Settings"
          className="flex size-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
