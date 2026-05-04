export type Theme = 'dark' | 'light' | 'system';

export interface UserProfile {
  name: string;
}

export interface ApiResponse<T> {
  data: T;
}

export type AgentKind = 'claude' | 'codex' | 'opencode';

export interface AgentProfile {
  id: string;
  name: string;
  agent_kind: AgentKind;
  args: string[];
  env: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface AgentProfileInput {
  name: string;
  agent_kind: AgentKind;
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
