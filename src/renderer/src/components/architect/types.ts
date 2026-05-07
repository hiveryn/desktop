export type SessionKind = 'architect' | 'ticket';
export type SessionStatus = 'running' | 'idle' | 'error';
export type AgentKind = 'claude' | 'opencode' | 'codex';
export type ContextTab = 'kanban' | 'diff' | 'files' | 'terminal' | 'ticket';

export interface Session {
  id: string;
  kind: SessionKind;
  label: string;
  agentKind: AgentKind;
  status: SessionStatus;
  workdir: string;
}

export interface KanbanTicket {
  id: string;
  title: string;
  tag: string;
  col: 'backlog' | 'in-progress' | 'done';
  agent?: string;
}

export const CONTEXT_TABS_BY_KIND: Record<SessionKind, ContextTab[]> = {
  architect: ['kanban', 'files', 'terminal'],
  ticket: ['diff', 'files', 'ticket', 'terminal'],
};

export const DEFAULT_CONTEXT_TAB: Record<SessionKind, ContextTab> = {
  architect: 'kanban',
  ticket: 'diff',
};
