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

type SessionKind = 'architect' | 'ticket';
type SessionStatus = 'running' | 'idle' | 'error';

interface Session {
  id: string;
  kind: SessionKind;
  label: string;
  agentKind: AgentKind;
  status: SessionStatus;
  workdir: string;
}

interface KanbanTicket {
  id: string;
  title: string;
  tag: string;
  col: 'backlog' | 'in-progress' | 'done';
  agent?: string;
}

// ── Spawn ──────────────────────────────────────────────────────────────────

interface SpawnResult {
  session_id: string;
  ws_url: string;
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
  };
  architects: {
    list: () => Promise<Architect[]>;
    get: (key: string) => Promise<Architect>;
    spawn: (key: string, profileName: string) => Promise<SpawnResult>;
  };
  session: {
    connect: (sessionId: string, wsUrl: string) => Promise<void>;
    disconnect: () => Promise<void>;
    send: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    onData: (callback: (data: string) => void) => () => void;
  };
  launcher: {
    openArchitect: (key: string) => Promise<void>;
  };
  sessions: {
    list: () => Promise<Session[]>;
    create: (profileId: string, workdir: string) => Promise<Session>;
  };
  tickets: {
    list: () => Promise<KanbanTicket[]>;
  };
  system: {
    getHome: () => Promise<SystemHome>;
  };
  daemon: {
    onRequest: (callback: (entry: RequestLogEntry) => void) => () => void;
  };
}

interface Window {
  hiveryn: HiverynAPI;
}
