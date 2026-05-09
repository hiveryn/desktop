export type Theme = 'dark' | 'light' | 'system';

export interface UserProfile {
  name: string;
}

export interface ApiResponse<T> {
  data: T;
}

export type AgentKind = 'claude' | 'codex' | 'opencode';

export interface AgentProfile {
  name: string;
  agent: string;
  args: string[];
  env: Record<string, string>;
}

// ── Daemon envelope ────────────────────────────────────────────────────────

export interface EnvelopeLogEntry {
  level: string;
  message: string;
  timestamp: string;
}

export interface EnvelopeMeta {
  request_id: string;
}

export interface EnvelopeError {
  code: string;
  message: string;
  details: Record<string, string> | null;
  stacktrace: string;
}

export interface Envelope<T = unknown> {
  data: T | null;
  error: EnvelopeError | null;
  logs: EnvelopeLogEntry[];
  commands: unknown[];
  meta: EnvelopeMeta;
}

export interface DaemonResult<T = unknown> {
  envelope: Envelope<T>;
  httpStatus: number;
}

// ── Sessions & tickets ─────────────────────────────────────────────────────

export type SessionKind = 'architect' | 'ticket';
export type SessionStatus = 'running' | 'idle' | 'error';

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

export interface ArchitectRepo {
  key: string;
  path: string;
}

export interface Architect {
  key: string;
  path: string;
  group: string;
  repos?: ArchitectRepo[];
}

export interface ArchitectInfo {
  name: string;
  path: string;
}

export interface SystemHome {
  home: string;
}

// ── Request log ────────────────────────────────────────────────────────────

export interface RequestLogEntry {
  id: string;
  channel: string;
  method: string;
  path: string;
  httpStatus: number;
  durationMs: number;
  ts: number;
  envelope: Envelope;
}
