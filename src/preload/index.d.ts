// ── Envelope ───────────────────────────────────────────────────────────────

interface EnvelopeLogEntry {
  level: string;
  message: string;
  timestamp: string;
}

interface EnvelopeMeta {
  request_id: string;
}

interface EnvelopeError {
  code: string;
  message: string;
  details: Record<string, string> | null;
  stacktrace: string;
}

interface Envelope {
  data: unknown;
  error: EnvelopeError | null;
  logs: EnvelopeLogEntry[];
  commands: unknown[];
  meta: EnvelopeMeta;
}

// ── Request log ────────────────────────────────────────────────────────────

interface RequestLogEntry {
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

interface InfraErrorEvent {
  source: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

// ── Structured logging ─────────────────────────────────────────────────────

type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StructuredLogError {
  message: string;
  stack: string;
}

interface RendererLogPayload {
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

// ── IPC error ──────────────────────────────────────────────────────────────

interface IpcError extends Error {
  status?: number;
  code?: string;
  details?: Record<string, string> | null;
  stacktrace?: string;
}

// ── Agent profiles ─────────────────────────────────────────────────────────

type AgentKind = 'claude' | 'codex' | 'opencode';

interface AgentProfile {
  name: string;
  agent: string;
  args: string[];
  env: Record<string, string>;
}

// ── Canonical shared domain types ─────────────────────────────────────────
// Aliased directly from @hiveryn/shared/domain (the single source of truth)
// rather than re-declared, so this surface never drifts from the wire shape.
// Inline `import(...)` keeps the file an ambient global (a top-level `import`
// statement would turn it into a module and drop these globals).

type SessionType = import('@hiveryn/shared/domain').SessionType;
type SessionCreatedBy = import('@hiveryn/shared/domain').SessionCreatedBy;
type SessionRunStatus = import('@hiveryn/shared/domain').SessionRunStatus;
type SessionRunFailureReason = import('@hiveryn/shared/domain').SessionRunFailureReason;
type AgentProfileSnapshot = import('@hiveryn/shared/domain').AgentProfileSnapshot;
type SessionRun = import('@hiveryn/shared/domain').SessionRun;
type Session = import('@hiveryn/shared/domain').Session;
type SessionEvent = import('@hiveryn/shared/domain').SessionEvent;

// ── Intents ────────────────────────────────────────────────────────────────

type IntentType = import('@hiveryn/shared/domain').IntentType;
type IntentPolicy = import('@hiveryn/shared/domain').IntentPolicy;
type IntentOrigin = import('@hiveryn/shared/domain').IntentOrigin;
type Intent = import('@hiveryn/shared/domain').Intent;
type IntentInputValues = import('@hiveryn/shared/domain').IntentInputValues;

// ── Tickets ────────────────────────────────────────────────────────────────

type TicketStatus = import('@hiveryn/shared/domain').TicketStatus;
type TicketWarning = import('@hiveryn/shared/domain').TicketWarning;
type CommitRef = import('@hiveryn/shared/domain').CommitRef;
type TicketOutcome = import('@hiveryn/shared/domain').TicketOutcome;
type TicketConclusion = import('@hiveryn/shared/domain').TicketConclusion;
type TicketSummary = import('@hiveryn/shared/domain').TicketSummary;
type Ticket = import('@hiveryn/shared/domain').Ticket;
type TicketBoard = import('@hiveryn/shared/domain').TicketBoard;

type WorkflowList = import('@hiveryn/shared/domain').WorkflowList;
type ActionDefinition = import('@hiveryn/shared/domain').ActionDefinition;
type ActionList = import('@hiveryn/shared/domain').ActionList;
type ActionRun = import('@hiveryn/shared/domain').ActionRun;
type LaunchActionRequest = import('@hiveryn/shared/domain').LaunchActionRequest;
type LaunchActionResult = import('@hiveryn/shared/domain').LaunchActionResult;
type WorkerPreflight = import('@hiveryn/shared/domain').WorkerPreflight;

// The renderer omits `outcome` for architect conclusions (the daemon ignores
// it there), so this
// stays a local shape with an optional `outcome` rather than aliasing shared's
// stricter required-`outcome` ConcludeSessionParams.
interface ConcludeSessionParams {
  body: string;
  commits: CommitRef[];
  outcome?: TicketOutcome;
  rejection_reason: string;
}

// ── Desktop-specific IPC types (canonical home: ../shared/types) ────────────

type SessionRunResult = import('../shared/types').SessionRunResult;
type TicketEditInput = import('../shared/types').TicketEditInput;
type TicketMetadataInput = import('../shared/types').TicketMetadataInput;
type TicketCreateInput = import('../shared/types').TicketCreateInput;
type TicketDeleteResult = import('../shared/types').TicketDeleteResult;

// ── Session data event ─────────────────────────────────────────────────────

interface SessionDataEvent {
  sessionId: string;
  terminalId: string;
  data: Uint8Array | string;
}

// ── Multi-terminal ─────────────────────────────────────────────────────────

interface TerminalInfo {
  terminal_id: string;
  session_id: string;
  command: string;
  status: string;
  workdir_id?: string;
  workdir_title?: string;
  workdir_path?: string;
  workdir_display_path?: string;
}

type TerminalWorkdir = import('@hiveryn/shared/domain').TerminalWorkdir;

type TerminalPlacement = 'tab' | 'split';

type CreateTerminalParams =
  | { placement: 'tab'; workdir_id: string }
  | { placement: 'split'; base_tab_id: string; workdir_id: string };

interface SessionTab {
  type: string;
  id?: string;
  command?: string;
  status?: string;
  placement?: TerminalPlacement;
  base_tab_id?: string;
  workdir_id?: string;
  workdir_title?: string;
  workdir_path?: string;
  workdir_display_path?: string;
}

// ── Architects ─────────────────────────────────────────────────────────────

interface ArchitectInfo {
  name: string;
  path: string;
}

interface ArchitectStatusSession {
  id: string;
  title: string;
  status: 'running' | 'completed' | 'failed';
  agent_status: string;
  started_at: string;
}

interface ArchitectStatus {
  key: string;
  name: string;
  path: string;
  status: string | null;
  sessions: ArchitectStatusSession[];
}

interface SystemRuntime {
  environment: string;
  home: string;
  config_path: string;
  db_path: string;
  log_dir: string;
  bind_address: string;
  port: number;
  base_url: string;
}

type DaemonHealthStatus = 'healthy' | 'unreachable' | 'unknown';

interface DaemonHealthState {
  status: DaemonHealthStatus;
}

interface DesktopConfig {
  health_poll_interval_ms: number;
}

type AppMode = 'development' | 'production';

interface ArchitectRepo {
  key: string;
  path: string;
}

interface Architect {
  key: string;
  name: string;
  path: string;
  repos?: ArchitectRepo[];
}

type ArchitectStreamEvent = import('../shared/types').ArchitectStreamEvent;
type ActionStreamEvent = import('../shared/types').ActionStreamEvent;

// ── Git diff (repo-scoped, native git-diff tab) ─────────────────────────────

interface RepoDiffSection {
  kind: 'staged' | 'unstaged';
  raw_unified_diff?: string;
  is_binary: boolean;
  additions: number;
  deletions: number;
  raw_diff_bytes: number;
  truncated?: boolean;
}

interface RepoDiffFile {
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

interface RepoDiffSummary {
  files: number;
  staged_files?: number;
  unstaged_files?: number;
  additions: number;
  deletions: number;
}

interface RepoDiffResponse {
  repo: string;
  repo_path: string;
  files: RepoDiffFile[];
  summary: RepoDiffSummary;
}

interface RepoCommitDiffResponse {
  repo: string;
  repo_path: string;
  sha: string;
  parent_sha?: string;
  is_merge: boolean;
  files: RepoDiffFile[];
  summary: RepoDiffSummary;
}

interface RepoStatusEntry {
  /** Repo-relative, "/"-separated. */
  path: string;
  index: string;
  worktree: string;
  orig_path?: string;
}

interface RepoStatusResponse {
  repo: string;
  repo_path: string;
  /** Go marshals an empty slice as null — a clean repo sends null here. */
  entries: RepoStatusEntry[] | null;
}

// ── Filesystem browse (native files tab) ────────────────────────────────────

type FsEntryKind = 'file' | 'dir' | 'symlink' | 'other';

interface FsEntry {
  name: string;
  kind: FsEntryKind;
  size: number;
  mtime: string;
  ignored?: boolean;
}

interface FsTreeResponse {
  path: string;
  entries: FsEntry[];
  total: number;
  truncated?: boolean;
}

interface FsFileResponse {
  path: string;
  contentType: string;
  size: number;
  truncated: boolean;
  bytes: Uint8Array;
}

interface FsWriteResponse {
  path: string;
  size: number;
  mtime: string;
}

interface FsSearchMatch {
  /** Relative to the searched root, "/"-separated. */
  path: string;
}

interface FsSearchResponse {
  root: string;
  query: string;
  matches: FsSearchMatch[];
  /** All matches found, before the limit cap. */
  total: number;
  /** Candidate collection hit the daemon's walk budget; matches may be incomplete. */
  truncated?: boolean;
}

interface FsContentSearchMatch {
  /** Relative to the searched root, "/"-separated. */
  path: string;
  line: number;
  text: string;
}

interface FsContentSearchResponse {
  root: string;
  query: string;
  /** Go marshals an empty slice as null — no matches sends null here. */
  matches: FsContentSearchMatch[] | null;
  /** The match cap (or walk budget) was hit; more matches may exist. */
  truncated?: boolean;
}

// ── Window API ─────────────────────────────────────────────────────────────

interface HiverynAPI {
  user: {
    getProfile: () => Promise<{ data: { name: string } }>;
  };
  app: {
    getPlatform: () => Promise<string>;
    getMode: () => Promise<AppMode>;
    getDaemonUrl: () => Promise<string>;
    onGpuProcessCrashed: (callback: () => void) => () => void;
  };
  profiles: {
    list: () => Promise<AgentProfile[]>;
  };
  architect: {
    getInfo: () => Promise<ArchitectInfo>;
    openLauncher: () => Promise<void>;
    closeWindow: () => Promise<void>;
  };
  architects: {
    list: () => Promise<Architect[]>;
    get: (key: string) => Promise<Architect>;
    status: () => Promise<ArchitectStatus[]>;
    subscribeEvents: (key: string, callback: (event: ArchitectStreamEvent) => void) => () => void;
  };
  session: {
    subscribe: (sessionId: string) => Promise<void>;
    connect: (
      sessionId: string,
      terminalId: string,
      size?: { cols: number; rows: number },
    ) => Promise<void>;
    disconnect: (sessionId?: string, terminalId?: string) => Promise<void>;
    send: (sessionId: string, terminalId: string, data: string) => void;
    resize: (sessionId: string, terminalId: string, cols: number, rows: number) => void;
    onData: (callback: (payload: SessionDataEvent) => void) => () => void;
    onEvent: (callback: (event: SessionEvent) => void) => () => void;
    onTerminalClosed: (
      callback: (payload: { sessionId: string; terminalId: string }) => void,
    ) => () => void;
  };
  launcher: {
    openArchitect: (key: string) => Promise<void>;
  };
  actions: {
    openWindow: () => Promise<void>;
    list: () => Promise<ActionList>;
    get: (name: string) => Promise<ActionDefinition>;
    launch: (name: string, request: LaunchActionRequest) => Promise<LaunchActionResult>;
    runs: (action?: string, limit?: number) => Promise<ActionRun[]>;
    run: (id: string) => Promise<ActionRun>;
    cancel: (id: string) => Promise<ActionRun>;
    subscribeEvents: (callback: (event: ActionStreamEvent) => void) => () => void;
  };
  tray: {
    hide: () => Promise<void>;
    setHeight: (height: number) => Promise<void>;
    onShown: (callback: () => void) => () => void;
  };
  palette: {
    focusArchitect: (key: string, sessionId?: string) => Promise<void>;
    onSwitchSession: (callback: (sessionId: string | null) => void) => () => void;
  };
  workflows: {
    list: (architectKey: string, repos: string[]) => Promise<WorkflowList>;
    preflight: (architectKey: string) => Promise<WorkerPreflight>;
  };
  sessions: {
    list: () => Promise<Session[]>;
    get: (sessionId: string) => Promise<Session>;
    create: (
      sessionType: SessionType,
      architectKey: string,
      ticketId?: string,
      workflows?: string[],
    ) => Promise<Session>;
    createRun: (
      intentId: string,
      profileName: string,
      cols?: number,
      rows?: number,
    ) => Promise<SessionRunResult>;
    conclude: (sessionId: string, params: ConcludeSessionParams) => Promise<void>;
    discard: (sessionId: string) => Promise<void>;
    approveIntent: (
      sessionId: string,
      intentId: string,
      inputs?: IntentInputValues,
    ) => Promise<Intent>;
    denyIntent: (sessionId: string, intentId: string, reason?: string) => Promise<void>;
    getTicket: (sessionId: string) => Promise<Ticket>;
  };
  tickets: {
    list: (architectKey: string) => Promise<TicketBoard>;
    get: (architectKey: string, id: string) => Promise<Ticket>;
    edit: (architectKey: string, id: string, input: TicketEditInput) => Promise<Ticket>;
    updateMetadata: (
      architectKey: string,
      id: string,
      input: TicketMetadataInput,
    ) => Promise<Ticket>;
    move: (architectKey: string, id: string, to: TicketStatus) => Promise<Ticket>;
    delete: (architectKey: string, id: string) => Promise<TicketDeleteResult>;
    create: (architectKey: string, input: TicketCreateInput) => Promise<Ticket>;
  };
  system: {
    getRuntime: () => Promise<SystemRuntime>;
    getUserHome: () => Promise<string>;
  };
  terminals: {
    listWorkdirs: (sessionId: string) => Promise<TerminalWorkdir[]>;
    list: (sessionId: string) => Promise<TerminalInfo[]>;
    create: (sessionId: string, body: CreateTerminalParams) => Promise<TerminalInfo>;
    kill: (sessionId: string, terminalId: string) => Promise<void>;
  };
  tabs: {
    list: (sessionId: string) => Promise<SessionTab[]>;
  };
  fs: {
    listDir: (path: string) => Promise<FsTreeResponse>;
    search: (path: string, query: string) => Promise<FsSearchResponse>;
    searchContent: (path: string, query: string) => Promise<FsContentSearchResponse>;
    readFile: (path: string) => Promise<FsFileResponse>;
    writeFile: (path: string, content: string) => Promise<FsWriteResponse>;
    createFile: (path: string) => Promise<FsWriteResponse>;
    pickDirectory: () => Promise<string | null>;
    revealInFinder: (path: string) => Promise<null>;
    openExternal: (path: string) => Promise<null>;
  };
  editor: {
    setDirtyCount: (count: number) => void;
  };
  repos: {
    diff: (architectKey: string, repoKey: string) => Promise<RepoDiffResponse>;
    status: (architectKey: string, repoKey: string) => Promise<RepoStatusResponse>;
    commitDiff: (
      architectKey: string,
      repoKey: string,
      sha: string,
    ) => Promise<RepoCommitDiffResponse>;
  };
  daemon: {
    getHealthStatus: () => Promise<DaemonHealthState>;
    onHealthStatus: (callback: (state: DaemonHealthState) => void) => () => void;
    onRequest: (callback: (entry: RequestLogEntry) => void) => () => void;
  };
  errors: {
    onInfraEvent: (callback: (event: InfraErrorEvent) => void) => () => void;
  };
  logs: {
    writeRenderer: (entry: RendererLogPayload) => void;
  };
  config: {
    getShortcuts: () => Promise<Record<string, Record<string, string>>>;
    getDesktop: () => Promise<DesktopConfig>;
  };
}

interface Window {
  hiveryn: HiverynAPI;
}
