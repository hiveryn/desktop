import {
  ActionIcon,
  Activity,
  AgentIdle,
  AgentStopped,
  AgentWaiting,
  Close,
  TabBar,
  type TabBarTab,
  Terminal,
} from '@components';
import { useMemo } from 'react';
import { type SessionRecord, useSessionStore } from '../../../state/sessionStore';
import { HOME_TAB_ID } from '../actionsModel';

function iconForStatus(status: string | undefined): TabBarTab['icon'] {
  switch (status) {
    case 'active':
      return Activity;
    case 'idle':
      return AgentIdle;
    case 'waiting':
      return AgentWaiting;
    case 'stopped':
      return AgentStopped;
    default:
      return Terminal;
  }
}

interface Props {
  homeActive: boolean;
  onHome(): void;
  onSession(sessionId: string): void;
  /** Stop the execution a session tab belongs to. */
  onStop(session: SessionRecord): void;
}

// The Actions home first, then one tab per running action session.
export default function ActionsBottomTabs({ homeActive, onHome, onSession, onStop }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const tabs = useMemo<TabBarTab[]>(
    () => [
      { id: HOME_TAB_ID, icon: ActionIcon, label: 'Actions' },
      ...Object.values(sessions).map(
        (session): TabBarTab => ({
          id: session.id,
          icon: iconForStatus(session.status),
          label: session.label,
          onAction: () => onStop(session),
          actionLabel: 'Stop execution',
          actionIcon: Close,
        }),
      ),
    ],
    [sessions, onStop],
  );

  return (
    <TabBar
      tabs={tabs}
      activeTab={homeActive ? HOME_TAB_ID : (activeSessionId ?? HOME_TAB_ID)}
      side="bottom"
      onTabChange={(id: string) => {
        if (id === HOME_TAB_ID) {
          onHome();
          return;
        }
        if (useSessionStore.getState().sessions[id]) onSession(id);
      }}
    />
  );
}
