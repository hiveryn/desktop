import { TabBar, type TabBarTab, Terminal } from '@components';
import { useMemo } from 'react';
import { useSessionStore } from '../../../state/sessionStore';

const ARCHITECT_TAB_LABEL = 'Architect';

// Bottom bar showing one tab per session (architect first, then workers).
// Workers can be closed; closing terminates the session.
export default function BottomTabs() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const pendingApprovals = useSessionStore((s) => s.pendingApprovals);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const activeId = activeSessionId ?? Object.values(sessions)[0]?.id ?? '';

  const tabs = useMemo<TabBarTab[]>(() => {
    const arr = Object.values(sessions);
    const architect = arr.find((s) => s.type === 'architect');
    const workers = arr.filter((s) => s.type !== 'architect');

    // A pending approval badges its tab only while that session isn't active —
    // the active session shows the dialog itself, so no badge is needed.
    const needsAttention = (id: string): boolean => id in pendingApprovals && id !== activeId;

    const result: TabBarTab[] = [];
    if (architect) {
      result.push({
        id: architect.id,
        icon: Terminal,
        label: ARCHITECT_TAB_LABEL,
        notify: needsAttention(architect.id),
      });
    }
    for (const worker of workers) {
      result.push({
        id: worker.id,
        icon: Terminal,
        label: worker.label,
        notify: needsAttention(worker.id),
      });
    }
    return result;
  }, [sessions, pendingApprovals, activeId]);

  return (
    <TabBar
      tabs={tabs}
      activeTab={activeId}
      side="bottom"
      onTabChange={(id: string) => {
        const session = useSessionStore.getState().sessions[id];
        if (!session) return;
        setActiveSession(id);
      }}
    />
  );
}
