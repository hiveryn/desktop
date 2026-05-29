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

// ── Structured logging ──────────────────────────────────────────────────────

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

// ── Sessions & tickets ─────────────────────────────────────────────────────

type SessionKind = 'architect' | 'ticket' | 'freeform';

interface SessionRun {
  id: string;
  session_intent_id: string;
  status: 'running' | 'completed' | 'failed';
  profile_name: string;
  profile_snapshot?: { agent: string; args: string[]; env: Record<string, string> };
  workdir: string;
  native_id?: string;
  failure_reason?: 'launch_failed' | 'process_exited' | 'restore_failed' | 'user_cancelled';
  main_terminal_id?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

interface SessionIntent {
  id: string;
  architect_key: string;
  session_type: SessionKind;
  context_id: string;
  prompt?: string;
  instructions?: string;
  created_by?: 'desktop' | 'architect_mcp';
  created_at: string;
  updated_at: string;
  current_run?: SessionRun;
}

interface SessionRunResult {
  run: SessionRun;
  main_terminal_id: string;
  ws_url: string;
}

interface SessionEvent {
  id: string;
  session_intent_id: string;
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

type TicketStatus = 'backlog' | 'progress' | 'done';

interface TicketWarning {
  code: string;
  message: string;
}

interface TicketCommit {
  sha: string;
  repo: string;
}

interface TicketConclusion {
  started_at: string;
  concluded_at: string;
  agent: string;
  profile: string;
  rejected: boolean;
  rejection_reason: string;
  commits: TicketCommit[];
  body: string;
}

interface TicketSummary {
  id: string;
  status: TicketStatus;
  title: string;
  repo: string;
  created: string;
  updated: string;
  references: string[];
  has_conclusion: boolean;
}

interface Ticket extends TicketSummary {
  warnings: TicketWarning[];
  body: string;
  conclusion: TicketConclusion | null;
}

interface TicketBoard {
  backlog: TicketSummary[];
  progress: TicketSummary[];
  done: TicketSummary[];
}

interface TicketEditInput {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

interface TicketMetadataInput {
  title?: string;
  repo?: string;
  references?: string[];
}

interface TicketCreateInput {
  title: string;
  repo?: string;
  body?: string;
  references?: string[];
}

interface TicketDeleteResult {
  deleted: boolean;
}

// ── Session data event ─────────────────────────────────────────────────────

interface SessionDataEvent {
  sessionId: string;
  terminalId: string;
  data: Uint8Array | string;
}

// ── Multi-terminal ──────────────────────────────────────────────────────────

interface TerminalInfo {
  terminal_id: string;
  session_id: string;
  command: string;
  status: string;
}

type CreateTerminalBody = Record<string, never>;

interface SessionTab {
  type: 'kanban' | 'event-log' | 'terminal' | 'ticket';
  id?: string;
  command?: string;
  status?: string;
}

// ── Architects ─────────────────────────────────────────────────────────────

interface ArchitectInfo {
  name: string;
  path: string;
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
  path: string;
  group: string;
  repos?: ArchitectRepo[];
}

interface WorkspaceChangedEvent {
  type: string;
  architect_key: string;
  reason: string;
  ticket_id: string;
  at: string;
}

// ── Window API ─────────────────────────────────────────────────────────────

interface HiverynAPI {
  preferences: {
    getTheme: () => Promise<'dark' | 'light' | 'system'>;
    setTheme: (value: 'dark' | 'light' | 'system') => Promise<void>;
    onThemeChange: (callback: (value: 'dark' | 'light') => void) => () => void;
  };
  user: {
    getProfile: () => Promise<{ data: { name: string } }>;
  };
  app: {
    getPlatform: () => Promise<string>;
    getMode: () => Promise<AppMode>;
    getDaemonUrl: () => Promise<string>;
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
    subscribeEvents: (key: string, callback: (event: WorkspaceChangedEvent) => void) => () => void;
  };
  session: {
    subscribe: (sessionId: string) => Promise<void>;
    connect: (sessionId: string, terminalId: string) => Promise<void>;
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
  sessions: {
    list: () => Promise<SessionIntent[]>;
    create: (
      sessionType: SessionKind,
      architectKey: string,
      ticketId?: string,
    ) => Promise<SessionIntent>;
    createRun: (
      intentId: string,
      profileName: string,
      cols?: number,
      rows?: number,
    ) => Promise<SessionRunResult>;
    conclude: (sessionId: string, body: string) => Promise<void>;
    approveConclusion: (sessionId: string) => Promise<void>;
    rejectConclusion: (sessionId: string, reason?: string) => Promise<void>;
    createFreeform: (
      architectKey: string,
      prompt: string,
      workdir: string,
      slug: string,
    ) => Promise<SessionIntent>;
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
  };
  terminals: {
    list: (sessionId: string) => Promise<TerminalInfo[]>;
    create: (sessionId: string, body: CreateTerminalBody) => Promise<TerminalInfo>;
    kill: (sessionId: string, terminalId: string) => Promise<void>;
  };
  tabs: {
    list: (sessionId: string) => Promise<SessionTab[]>;
  };
  daemon: {
    getHealthStatus: () => Promise<DaemonHealthState>;
    onHealthStatus: (callback: (state: DaemonHealthState) => void) => () => void;
    onRequest: (callback: (entry: RequestLogEntry) => void) => () => void;
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
