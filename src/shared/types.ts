// ── Re-exports from @hiveryn/shared/domain ────────────────────────────────
// Re-export CreateTerminalParams as the wire-compatible equivalent of the
// old CreateTerminalBody (which was Record<string, never>).
export type {
  AgentProfileSnapshot,
  AppendSessionEventParams,
  ArchitectConclusion,
  ArchitectEvent,
  ArchitectEventReason,
  CommitRef,
  ConcludeSessionParams,
  ConcludeSessionResult,
  ConclusionSummary,
  ConflictError,
  CreateSessionRequest,
  CreateSessionRunRequest,
  CreateSessionRunResult,
  CreateTerminalParams as CreateTerminalBody,
  CreateTicketParams,
  EditTicketParams,
  Intent,
  IntentOrigin,
  IntentOutcome,
  IntentPolicy,
  IntentType,
  InternalError,
  MoveTicketParams,
  MoveTicketToDoneParams,
  MoveTicketToDoneResult,
  NotFoundError,
  Session,
  SessionCreatedBy,
  SessionEvent,
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

import type { ArchitectEvent } from '@hiveryn/shared/domain';

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
  // Extra repositories in scope beyond the primary `repo`. Daemon wire shape:
  // order is not meaningful, keys are unique and exclude the primary repo.
  additional_repos?: string[];
  references?: string[];
}

export interface TicketCreateInput {
  title: string;
  repo: string;
  additional_repos: string[];
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

// ── Git diff (repo-scoped, native git-diff tab) ─────────────────────────────

export interface RepoDiffSection {
  kind: 'staged' | 'unstaged';
  raw_unified_diff?: string;
  is_binary: boolean;
  additions: number;
  deletions: number;
  raw_diff_bytes: number;
  truncated?: boolean;
}

export interface RepoDiffFile {
  path: string;
  old_path?: string;
  status: 'modified' | 'new' | 'deleted' | 'renamed' | 'copied' | 'untracked';
  is_binary: boolean;
  additions: number;
  deletions: number;
  raw_diff_bytes: number;
  truncated?: boolean;
  raw_unified_diff?: string;
  sections?: RepoDiffSection[];
}

// IPC-only params for roadmap:read — mirrors the daemon's GET query params
// (view/id/depth). Not a domain type, so it lives here rather than
// @hiveryn/shared/domain.
export interface RoadmapReadParams {
  view?: 'current' | 'archive';
  id?: string;
  depth?: number;
}

export interface RepoDiffSummary {
  files: number;
  staged_files?: number;
  unstaged_files?: number;
  additions: number;
  deletions: number;
}

export interface RepoDiffResponse {
  repo: string;
  repo_path: string;
  files: RepoDiffFile[];
  summary: RepoDiffSummary;
}

export interface RepoCommitDiffResponse {
  repo: string;
  repo_path: string;
  sha: string;
  parent_sha?: string;
  is_merge: boolean;
  files: RepoDiffFile[];
  summary: RepoDiffSummary;
}

// GET /api/architects/:key/repos/:repoKey/status — lightweight changed-path
// listing for tree decoration. Index/worktree carry the two git porcelain
// status columns verbatim (" " unchanged, "?" untracked).
export interface RepoStatusEntry {
  /** Repo-relative, "/"-separated. */
  path: string;
  index: string;
  worktree: string;
  orig_path?: string;
}

export interface RepoStatusResponse {
  repo: string;
  repo_path: string;
  /** Go marshals an empty slice as null — a clean repo sends null here. */
  entries: RepoStatusEntry[] | null;
}

// ── Filesystem browse (native files tab) ────────────────────────────────────

export type FsEntryKind = 'file' | 'dir' | 'symlink' | 'other';

export interface FsEntry {
  name: string;
  kind: FsEntryKind;
  size: number;
  mtime: string;
  ignored?: boolean;
}

export interface FsTreeResponse {
  path: string;
  entries: FsEntry[];
  total: number;
  truncated?: boolean;
}

export interface FsSearchMatch {
  /** Relative to the searched root, "/"-separated. */
  path: string;
}

export interface FsSearchResponse {
  root: string;
  query: string;
  matches: FsSearchMatch[];
  /** All matches found, before the limit cap. */
  total: number;
  /** Candidate collection hit the daemon's walk budget; matches may be incomplete. */
  truncated?: boolean;
}

export interface FsContentSearchMatch {
  /** Relative to the searched root, "/"-separated. */
  path: string;
  line: number;
  text: string;
}

export interface FsContentSearchResponse {
  root: string;
  query: string;
  /** Go marshals an empty slice as null — no matches sends null here. */
  matches: FsContentSearchMatch[] | null;
  /** The match cap (or walk budget) was hit; more matches may exist. */
  truncated?: boolean;
}

// /api/fs/file returns raw bytes (not an envelope); the main process folds the
// body + sniffed headers into this shape so it can cross IPC as one payload.
export interface FsFileResponse {
  path: string;
  contentType: string;
  size: number;
  truncated: boolean;
  bytes: Uint8Array;
}

// PUT /api/fs/file result. Overwrite-only on the daemon side: saving can only
// edit files that already exist.
export interface FsWriteResponse {
  path: string;
  size: number;
  mtime: string;
}

// ── Browser tab native view (WebContentsView) IPC types ──────────────────────

// Viewport rect (from getBoundingClientRect) the renderer pushes to bounds-sync
// the native view to the browser pane's anchor.
export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Navigation state pushed main→renderer on every commit so the URL bar and
// back/forward buttons stay in sync with the native view.
export interface BrowserViewState {
  tabId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

// Payload for the view's setWindowOpenHandler → renderer mints a sibling tab.
export interface BrowserOpenNewTabPayload {
  sessionId: string;
  url: string;
}

// The daemon-emitted architect event shape lives in @hiveryn/shared/domain
// (ArchitectEvent / ArchitectEventReason / ARCHITECT_EVENT_TYPE) — it is a wire
// contract, so it must not be mirrored here.

// Synthetic event the main process emits on every SSE (re)connect so the
// renderer reconciles board and session state and recovers anything missed
// while disconnected. Not produced by the daemon: the architect stream has no
// backlog, so a reconnect is the only chance to catch up.
export const STREAM_CONNECTED_EVENT_TYPE = 'stream_connected';

export interface StreamConnectedEvent {
  type: typeof STREAM_CONNECTED_EVENT_TYPE;
  architect_key: string;
  at: string;
}

// Everything delivered on the architect:workspace-event channel: real daemon
// events plus the local (re)connect signal.
export type ArchitectStreamEvent = ArchitectEvent | StreamConnectedEvent;

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
