import { useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { BottomPanel } from '@/components/bottom-panel';
import { PageError } from '@/components/page-error';
import { Toaster } from '@/components/ui/sonner';
import { TitleBar } from '@/components/architect/title-bar';
import { SessionTabBar } from '@/components/architect/session-tab-bar';
import { SessionView } from '@/components/architect/session-view';
import type { Session } from '@/components/architect/types';
import { SettingsOverlay } from './pages/settings';

const ARCHITECT_SESSION: Session = {
  id: 'architect',
  kind: 'architect',
  label: 'Architect',
  agentKind: 'claude',
  status: 'running',
  workdir: '/architects/hiveryn',
};

type SettingsSection = 'agent-profiles' | 'appearance';

function App(): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([ARCHITECT_SESSION]);
  const [activeSessionId, setActiveSessionId] = useState('architect');
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('agent-profiles');

  useEffect(() => {
    void window.hiveryn.sessions.list().then((fetched) => {
      if (fetched.length > 0) {
        setSessions([ARCHITECT_SESSION, ...fetched]);
      }
    });
  }, []);

  function handleOpenSettings(section: SettingsSection): void {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  function handleSessionCreated(session: Session): void {
    setSessions((prev) => [...prev, session]);
    setActiveSessionId(session.id);
  }

  function handleNewSession(): void {
    handleOpenSettings('agent-profiles');
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  return (
    <ErrorBoundary FallbackComponent={PageError}>
      <div className="relative flex h-screen flex-col overflow-hidden">
        <TitleBar onOpenSettings={handleOpenSettings} />
        <SessionTabBar
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={setActiveSessionId}
          onNew={handleNewSession}
        />
        <SessionView
          key={activeSession.id}
          session={activeSession}
          onSessionCreated={handleSessionCreated}
        />
        <BottomPanel logOpen={logOpen} onLogOpenChange={setLogOpen} />

        {settingsOpen && (
          <SettingsOverlay
            initialSection={settingsSection}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

export { App };
