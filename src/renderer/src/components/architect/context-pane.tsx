import { useAtom } from 'jotai';
import { activeContextTabsAtom } from '@/store/atoms';
import { MockTerminal } from './mock-terminal';
import { DiffPane } from './diff-pane';
import { FilesPane } from './files-pane';
import { IconRail } from './icon-rail';
import { ArchitectKanban } from './kanban';
import { TicketPane } from './ticket-pane';
import type { ContextTab, Session } from './types';
import { CONTEXT_TABS_BY_KIND, DEFAULT_CONTEXT_TAB } from './types';

const BLUE = '\x1b[34m';

interface ContextPaneProps {
  session: Session;
  onSessionCreated: (session: Session) => void;
}

export function ContextPane({ session, onSessionCreated }: ContextPaneProps): React.JSX.Element {
  const [tabMap, setTabMap] = useAtom(activeContextTabsAtom);
  const tabs = CONTEXT_TABS_BY_KIND[session.kind];
  const defaultTab = DEFAULT_CONTEXT_TAB[session.kind];
  const activeTab = (tabMap[session.id] as ContextTab | undefined) ?? defaultTab;

  function handleSelect(tab: ContextTab): void {
    setTabMap((prev) => ({ ...prev, [session.id]: tab }));
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        {activeTab === 'kanban' && (
          <ArchitectKanban onSessionCreated={onSessionCreated} />
        )}
        {activeTab === 'diff' && <DiffPane />}
        {activeTab === 'files' && <FilesPane />}
        {activeTab === 'terminal' && (
          <div className="h-full bg-black p-1">
            <MockTerminal lines={[`${BLUE}$\x1b[0m `]} />
          </div>
        )}
        {activeTab === 'ticket' && <TicketPane sessionId={session.id} />}
      </div>
      <IconRail tabs={tabs} active={activeTab} onSelect={handleSelect} />
    </div>
  );
}
