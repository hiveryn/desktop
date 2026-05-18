import { TabBar, type TabBarTab, Terminal } from '@components';
import { useMemo } from 'react';
import { useSessionStore } from '../../../state/sessionStore';

const ARCHITECT_TAB_LABEL = 'Architect';

// Bottom bar showing one tab per session (architect first, then workers).
// Workers can be closed; closing terminates the session.
export default function BottomTabs() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const setActiveRightTab = useSessionStore((s) => s.setActiveRightTab);
  const unregisterSession = useSessionStore((s) => s.unregisterSession);

  const tabs = useMemo<TabBarTab[]>(() => {
    const arr = Object.values(sessions);
    const architect = arr.find((s) => s.type === 'architect');
    const workers = arr.filter((s) => s.type === 'work');

    const result: TabBarTab[] = [];
    if (architect) {
      result.push({ id: architect.id, icon: Terminal, label: ARCHITECT_TAB_LABEL });
    }
    for (const worker of workers) {
      result.push({ id: worker.id, icon: Terminal, label: worker.label, closable: false });
    }
    return result;
  }, [sessions]);

  const activeId = activeSessionId ?? tabs[0]?.id ?? '';

  return (
    <TabBar
      tabs={tabs}
      activeTab={activeId}
      side="bottom"
      onTabChange={(id: string) => {
        const session = useSessionStore.getState().sessions[id];
        if (!session) return;
        setActiveSession(id);
        // Workers don't have kanban — flip to event-log on switch to a worker.
        if (session.type === 'work') {
          const currentRight = useSessionStore.getState().activeRightTab;
          if (currentRight === 'kanban') {
            setActiveRightTab('event-log');
          }
        }
      }}
      onTabClose={(id: string) => {
        void window.hiveryn.session.disconnect(id).then(() => {
          unregisterSession(id);
        });
      }}
    />
  );
}
