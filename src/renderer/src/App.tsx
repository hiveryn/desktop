import { LayoutDashboard, Settings2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { PageError } from '@/components/page-error';
import { RequestLog } from '@/components/request-log';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { AgentProfilesPage } from './pages/agent-profiles';
import { DashboardPage } from './pages/dashboard';

type Page = 'dashboard' | 'agent-profiles' | 'settings';

const NAV_ITEMS: { page: Page; icon: typeof LayoutDashboard; label: string }[] = [
  { page: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { page: 'agent-profiles', icon: Users, label: 'Agent Profiles' },
  { page: 'settings', icon: Settings2, label: 'Settings' },
];

function PlaceholderPage({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">{title} — coming soon</p>
    </div>
  );
}

function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('dashboard');
  const [platform, setPlatform] = useState('');
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    void window.hiveryn.app.getPlatform().then(setPlatform);
  }, []);

  return (
    <ErrorBoundary FallbackComponent={PageError}>
      <div className="flex h-screen flex-col">
        {/* Title bar / chrome */}
        <div
          className={cn(
            'flex h-10 shrink-0 items-center border-b border-border bg-card transition-colors duration-300',
            platform === 'darwin' ? 'pl-[80px] pr-4' : 'pl-4 pr-4',
          )}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-sm font-semibold text-foreground">Hiveryn</span>

          <nav
            className="ml-auto flex items-center gap-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {NAV_ITEMS.map(({ page: p, icon: Icon, label }) => (
              <Button
                key={p}
                variant="ghost"
                size="icon-sm"
                onClick={() => setPage(p)}
                title={label}
                className={page === p ? 'bg-accent' : ''}
              >
                <Icon className="size-3.5" />
              </Button>
            ))}
            <div className="mx-1 h-4 w-px bg-border" />
            <ThemeSwitcher />
          </nav>
        </div>

        {/* Page content — per-page boundary resets on navigation via key */}
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary key={page} FallbackComponent={PageError}>
            {page === 'dashboard' && <DashboardPage />}
            {page === 'agent-profiles' && <AgentProfilesPage />}
            {page === 'settings' && <PlaceholderPage title="Settings" />}
          </ErrorBoundary>
        </div>

        <RequestLog open={logOpen} onOpenChange={setLogOpen} />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

export { App };
