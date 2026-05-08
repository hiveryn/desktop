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
  id: string;
  name: string;
  agent_kind: AgentKind;
  args: string[];
  env: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface AgentProfileInput {
  name: string;
  agent_kind: AgentKind;
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

interface ArchitectInfo {
  name: string;
  path: string;
}

interface SystemHome {
  home: string;
}

interface ArchitectGroupRef {
  id: string;
  name: string;
}

interface ArchitectRepo {
  id: string;
  key: string;
  path: string | null;
  architect_id?: string;
  created_at: string;
  updated_at: string;
}

interface Architect {
  id: string;
  path: string;
  title: string;
  group?: ArchitectGroupRef;
  exists: boolean;
  repo_count?: number;
  repos?: ArchitectRepo[];
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
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
    create: (input: AgentProfileInput) => Promise<AgentProfile>;
    update: (id: string, input: AgentProfileInput) => Promise<AgentProfile>;
    delete: (id: string) => Promise<void>;
  };
  architect: {
    getInfo: () => Promise<ArchitectInfo>;
    openLauncher: () => Promise<void>;
  };
  architects: {
    list: () => Promise<Architect[]>;
    get: (id: string) => Promise<Architect>;
    delete: (id: string) => Promise<void>;
  };
  launcher: {
    openArchitect: (id: string) => Promise<void>;
    registerArchitect: (path: string, title: string) => Promise<{ id: string }>;
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
