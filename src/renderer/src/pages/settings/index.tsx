import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { PageError } from '@/components/page-error';
import { ThemeButton } from '@/components/bottom-panel';
import { AgentProfilesPage } from '../agent-profiles';

type SettingsSection = 'agent-profiles' | 'appearance';

interface SettingsOverlayProps {
  initialSection?: SettingsSection;
  onClose: () => void;
}

export function SettingsOverlay({ initialSection = 'agent-profiles', onClose }: SettingsOverlayProps): React.JSX.Element {
  const agentProfilesRef = useRef<HTMLDivElement>(null);
  const appearanceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map: Record<SettingsSection, React.RefObject<HTMLDivElement | null>> = {
      'agent-profiles': agentProfilesRef,
      'appearance': appearanceRef,
    };
    map[initialSection]?.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [initialSection]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <button
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold">Settings</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-10 p-8">
          {/* Agent Profiles section */}
          <section ref={agentProfilesRef}>
            <h2 className="mb-4 text-base font-semibold">Agent Profiles</h2>
            <ErrorBoundary FallbackComponent={PageError}>
              <AgentProfilesPage />
            </ErrorBoundary>
          </section>

          {/* Appearance section */}
          <section ref={appearanceRef}>
            <h2 className="mb-4 text-base font-semibold">Appearance</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Theme</span>
              <div className="h-[22px] overflow-hidden rounded border border-border">
                <ThemeButton />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
