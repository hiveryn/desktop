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
  daemon: {
    onRequest: (callback: (entry: RequestLogEntry) => void) => () => void;
  };
}

interface Window {
  hiveryn: HiverynAPI;
}
