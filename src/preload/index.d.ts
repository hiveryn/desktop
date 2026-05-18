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

type SessionKind = 'architect' | 'work';
type SessionStatus = 'running' | 'completed' | 'failed';

interface Session {
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

interface SessionEvent {
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

type TicketStatus = 'backlog' | 'progress' | 'done';

interface TicketWarning {
  code: string;
  message: string;
}

interface TicketConclusion {
  started_at: string;
  concluded_at: string;
  agent: string;
  profile: string;
  rejected: boolean;
  rejection_reason: string;
  commits: string[];
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

// ── Spawn ──────────────────────────────────────────────────────────────────

interface SpawnResult {
  session_id: string;
  main_terminal_id: string;
  ws_url: string;
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
  type: 'kanban' | 'event-log' | 'terminal';
  id?: string;
  command?: string;
  status?: string;
}

// ── Architects ─────────────────────────────────────────────────────────────

interface ArchitectInfo {
  name: string;
  path: string;
}

interface SystemHome {
  home: string;
}

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
    spawn: (key: string, profileName: string, cols?: number, rows?: number) => Promise<SpawnResult>;
    spawnWorker: (
      key: string,
      ticketId: string,
      profileName: string,
      cols?: number,
      rows?: number,
    ) => Promise<SpawnResult>;
    subscribeEvents: (key: string, callback: (event: WorkspaceChangedEvent) => void) => () => void;
  };
  session: {
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
    list: () => Promise<Session[]>;
    create: (profileId: string, workdir: string) => Promise<Session>;
    conclude: (sessionId: string, body: string) => Promise<void>;
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
    getHome: () => Promise<SystemHome>;
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
    onRequest: (callback: (entry: RequestLogEntry) => void) => () => void;
  };
  logs: {
    writeRenderer: (entry: RendererLogPayload) => void;
  };
  config: {
    getShortcuts: () => Promise<Record<string, Record<string, string>>>;
  };
}

interface Window {
  hiveryn: HiverynAPI;
}
