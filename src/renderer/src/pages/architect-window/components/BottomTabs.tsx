import { Close, TabBar, type TabBarTab, Terminal } from '@components';
import { useMemo } from 'react';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';

const ARCHITECT_TAB_LABEL = 'Architect';

interface BottomTabsProps {
  // Opens the conclude form for the given session.
  onConclude: (session: SessionRecord) => void;
}

// Bottom bar showing one tab per session (architect first, then workers).
// Each tab carries a conclude button; concluding terminates the session.
export default function BottomTabs({ onConclude }: BottomTabsProps) {
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

    const tabFor = (session: SessionRecord, label: string): TabBarTab => ({
      id: session.id,
      icon: Terminal,
      label,
      notify: needsAttention(session.id),
      onAction: () => onConclude(session),
      actionLabel: 'Conclude session',
      actionIcon: Close,
    });

    const result: TabBarTab[] = [];
    if (architect) {
      result.push(tabFor(architect, ARCHITECT_TAB_LABEL));
    }
    for (const worker of workers) {
      result.push(tabFor(worker, worker.label));
    }
    return result;
  }, [sessions, pendingApprovals, activeId, onConclude]);

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
