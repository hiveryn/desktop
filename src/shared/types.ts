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

// ── Structured logging ──────────────────────────────────────────────────────

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogError {
  message: string;
  stack: string;
}

export interface StructuredLogEntry {
  ts: string;
  lvl: StructuredLogLevel;
  src: 'desktop' | 'renderer';
  msg: string;
  file: string;
  line: number;
  fn: string;
  err?: StructuredLogError;
  ctx?: string;
  body?: unknown;
}

export interface RendererLogPayload {
  ts: string;
  lvl: StructuredLogLevel;
  msg: string;
  file: string;
  line: number;
  fn: string;
  err?: StructuredLogError;
  ctx?: string;
  body?: unknown;
}

// ── Sessions & tickets ─────────────────────────────────────────────────────

export type SessionKind = 'architect' | 'work';
export type SessionStatus = 'running' | 'completed' | 'failed';

export interface Session {
  id: string;
  profile_name: string;
  session_type: SessionKind;
  status: SessionStatus;
  prompt: string;
  instructions: string;
  architect_key: string;
  ticket_id?: string;
  native_id?: string;
  main_terminal_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  seq: number;
  type: string;
  status?: string;
  tool?: string;
  message?: string;
  native_id?: string;
  primary_native_id?: string;
  native_session_role?: string;
  metadata?: Record<string, string>;
  raw?: Record<string, unknown>;
  at: string;
}

export type TicketStatus = 'backlog' | 'progress' | 'done';

export interface TicketWarning {
  code: string;
  message: string;
}

export interface TicketCommit {
  sha: string;
  repo: string;
}

export interface TicketConclusion {
  started_at: string;
  concluded_at: string;
  agent: string;
  profile: string;
  rejected: boolean;
  rejection_reason: string;
  commits: TicketCommit[];
  body: string;
}

export interface TicketSummary {
  id: string;
  status: TicketStatus;
  title: string;
  repo: string;
  created: string;
  updated: string;
  references: string[];
  has_conclusion: boolean;
}

export interface Ticket extends TicketSummary {
  warnings: TicketWarning[];
  body: string;
  conclusion: TicketConclusion | null;
}

export interface TicketBoard {
  backlog: TicketSummary[];
  progress: TicketSummary[];
  done: TicketSummary[];
}

export interface TicketEditInput {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface TicketMetadataInput {
  title?: string;
  repo?: string;
  references?: string[];
}

export interface TicketCreateInput {
  title: string;
  repo?: string;
  body?: string;
  references?: string[];
}

export interface TicketDeleteResult {
  deleted: boolean;
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

export interface SpawnResult {
  session_id: string;
  main_terminal_id: string;
  ws_url: string;
}

export interface TerminalInfo {
  terminal_id: string;
  session_id: string;
  command: string;
  status: string;
}

export type CreateTerminalBody = Record<string, never>;

export interface SessionTab {
  type: 'kanban' | 'event-log' | 'terminal';
  id?: string;
  command?: string;
  status?: string;
}

export interface WorkspaceChangedEvent {
  type: string;
  architect_key: string;
  reason: string;
  ticket_id: string;
  at: string;
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
