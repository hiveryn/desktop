// ── Re-exports from @hiveryn/shared/domain ────────────────────────────────
// Re-export CreateTerminalParams as the wire-compatible equivalent of the
// old CreateTerminalBody (which was Record<string, never>).
export type {
  AgentProfileSnapshot,
  AppendSessionEventParams,
  ArchitectConclusion,
  CommitRef,
  ConcludeSessionParams,
  ConcludeSessionResult,
  ConclusionSummary,
  ConflictError,
  CreateSessionIntentRequest,
  CreateSessionRunRequest,
  CreateSessionRunResult,
  CreateTerminalParams as CreateTerminalBody,
  CreateTicketParams,
  EditTicketParams,
  InternalError,
  MoveTicketParams,
  MoveTicketToDoneParams,
  MoveTicketToDoneResult,
  NotFoundError,
  SessionCreatedBy,
  SessionEvent,
  SessionIntent,
  SessionRun,
  SessionRunFailureReason,
  SessionRunStatus,
  SessionTab,
  SessionType,
  TerminalInfo,
  Ticket,
  TicketBoard,
  TicketConclusion,
  TicketStatus,
  TicketSummary,
  TicketWarning,
  UpdateTicketMetadataParams,
  ValidationError,
} from '@hiveryn/shared/domain';

// ── Backward-compat aliases (gradual rename targets) ───────────────────────
export type SessionKind = import('@hiveryn/shared/domain').SessionType;
export type TicketCommit = import('@hiveryn/shared/domain').CommitRef;

// ── Desktop-specific types ─────────────────────────────────────────────────

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
  model?: string;
  yolo?: boolean;
  mode?: string;
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

// ── Structured logging ─────────────────────────────────────────────────────

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

// ── Session run result (desktop extension of shared) ───────────────────────

import type { SessionRun } from '@hiveryn/shared/domain';

export interface SessionRunResult {
  run: SessionRun;
  main_terminal_id: string;
  ws_url: string;
}

// ── Ticket CRUD inputs (desktop-side, daemon adds server-side fields) ──────

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

// ── Architects ─────────────────────────────────────────────────────────────

export interface ArchitectRepo {
  key: string;
  path: string;
}

export interface Architect {
  key: string;
  name: string;
  path: string;
  repos?: ArchitectRepo[];
}

export interface ArchitectStatusSession {
  id: string;
  title: string;
  status: 'running' | 'completed' | 'failed';
  agent_status: string;
  started_at: string;
}

export interface ArchitectStatus {
  key: string;
  name: string;
  path: string;
  status: string | null;
  sessions: ArchitectStatusSession[];
}

export interface ArchitectInfo {
  name: string;
  path: string;
}

// Daemon-emitted architect event (e.g. a ticket being concluded).
export const WORKSPACE_CHANGED_EVENT_TYPE = 'workspace_changed';
// Synthetic event the main process emits on every SSE (re)connect so the
// renderer reconciles board state and recovers anything missed while
// disconnected. Not produced by the daemon.
export const STREAM_CONNECTED_EVENT_TYPE = 'stream_connected';

export interface WorkspaceChangedEvent {
  type: string;
  architect_key: string;
  reason: string;
  ticket_id: string;
  at: string;
}

// ── System / daemon ────────────────────────────────────────────────────────

export interface SystemRuntime {
  environment: string;
  home: string;
  config_path: string;
  db_path: string;
  log_dir: string;
  bind_address: string;
  port: number;
  base_url: string;
}

export type DaemonHealthStatus = 'healthy' | 'unreachable' | 'unknown';

export interface DaemonHealthState {
  status: DaemonHealthStatus;
}

export interface DesktopConfig {
  health_poll_interval_ms: number;
}

export type AppMode = 'development' | 'production';

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

// ── Infra errors (SSE/WS failures currently console-only in main) ──────────

export interface InfraErrorEvent {
  source: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}
