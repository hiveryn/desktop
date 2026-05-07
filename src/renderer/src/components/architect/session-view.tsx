import { useAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { splitPctAtom } from '@/store/atoms';
import { cn } from '@/lib/utils';
import { ContextPane } from './context-pane';
import { MockTerminal } from './mock-terminal';
import type { AgentKind, Session, SessionStatus } from './types';

// ── ANSI helpers ───────────────────────────────────────────────────────────

const R = '\x1b[0m';
const DIM = '\x1b[90m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const BOLD = '\x1b[1m';

const ARCHITECT_LINES = [
  `${DIM}$ claude --permission-mode plan --model claude-sonnet-4-6${R}`,
  '',
  `${GREEN}${BOLD}Claude Code${R} ${DIM}v1.2.0${R}`,
  '',
  `${YELLOW}Architect session${R} ${DIM}· /architects/hiveryn${R}`,
  `${DIM}${'─'.repeat(44)}${R}`,
  '',
  `${DIM}Reading architect config...${R}`,
  `${GREEN}✓${R}  Found ${CYAN}4${R} tickets in backlog`,
  `${GREEN}✓${R}  Monitoring ${CYAN}2${R} active agent sessions`,
  '',
  `${DIM}Active sessions:${R}`,
  `  ${GREEN}●${R}  ${CYAN}ticket-001${R}  opencode  ${DIM}running${R}`,
  `  ${YELLOW}●${R}  ${CYAN}ticket-002${R}  claude    ${DIM}idle${R}`,
  '',
  `${YELLOW}>${R}  What would you like to work on?`,
  '',
];

const TICKET_OPENCODE_LINES = [
  `${DIM}$ opencode --model openai/gpt-5.4 --agent plan${R}`,
  '',
  `${CYAN}${BOLD}OpenCode${R} ${DIM}v0.3.1${R}`,
  '',
  `${BOLD}Ticket:${R} Add architect groups, architects, and repos`,
  `${DIM}Working in: /Users/kareemelbahrawy/hiveryn/daemon${R}`,
  '',
  `${YELLOW}>${R}  Reading ticket context...`,
  `${YELLOW}>${R}  Scanning codebase...`,
  `${GREEN}✓${R}  ${DIM}internal/store/profiles.go${R}`,
  `${GREEN}✓${R}  ${DIM}internal/domain/${R}`,
  `${GREEN}✓${R}  ${DIM}internal/api/router.go${R}`,
  '',
  `${YELLOW}>${R}  Creating migration 0003...`,
  `${GREEN}✓${R}  ${DIM}internal/store/migrations/0003_architect_groups.sql${R}`,
  '',
  `${YELLOW}>${R}  Adding domain types...`,
  `${GREEN}✓${R}  ${DIM}internal/domain/architect.go${R}`,
  '',
  `${YELLOW}>${R}  Implementing ArchitectGroupStore...`,
  `${DIM}    Writing SQLite queries...${R}`,
];

const TICKET_CLAUDE_LINES = [
  `${DIM}$ claude --permission-mode plan${R}`,
  '',
  `${MAGENTA}${BOLD}Claude Code${R} ${DIM}v1.2.0${R}`,
  '',
  `${BOLD}Ticket:${R} Scaffold Electron desktop app`,
  `${DIM}Working in: /Users/kareemelbahrawy/hiveryn/desktop${R}`,
  '',
  `${GREEN}✓${R}  Initialized electron-vite project`,
  `${GREEN}✓${R}  Configured TypeScript + Tailwind v4`,
  `${GREEN}✓${R}  Added shadcn/ui component library`,
  `${GREEN}✓${R}  Implemented mock IPC bridge`,
  `${GREEN}✓${R}  Built dashboard page`,
  `${GREEN}✓${R}  Added agent profiles page`,
  '',
  `${GREEN}${BOLD}All tasks complete.${R} ${DIM}15 files modified.${R}`,
  '',
  `${DIM}Session idle. Waiting for next instruction.${R}`,
  `${BLUE}$${R} `,
];

function terminalLines(session: Session): string[] {
  if (session.kind === 'architect') return ARCHITECT_LINES;
  if (session.agentKind === 'opencode') return TICKET_OPENCODE_LINES;
  return TICKET_CLAUDE_LINES;
}

// ── Status dot ─────────────────────────────────────────────────────────────

const STATUS_DOT: Record<SessionStatus, string> = {
  running: 'bg-green-500',
  idle:    'bg-muted-foreground/40',
  error:   'bg-destructive',
};

const AGENT_LABEL: Record<AgentKind, string> = {
  claude:   'claude',
  opencode: 'opencode',
  codex:    'codex',
};

// ── SessionView ────────────────────────────────────────────────────────────

interface SessionViewProps {
  session: Session;
  onSessionCreated: (session: Session) => void;
}

export function SessionView({ session, onSessionCreated }: SessionViewProps): React.JSX.Element {
  const [splitPct, setSplitPct] = useAtom(splitPctAtom);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function onMouseDown(): void {
    dragging.current = true;
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(50, Math.max(20, pct)));
    }
    function onMouseUp(): void {
      dragging.current = false;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [setSplitPct]);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {/* Left: agent terminal */}
      <div
        className="flex flex-col overflow-hidden bg-black"
        style={{ width: `${splitPct}%` }}
      >
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-white/5 px-3">
          <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[session.status])} />
          <span className="data-meta text-[#c8c8d8]/60">{AGENT_LABEL[session.agentKind]}</span>
          <span className="data-meta ml-auto text-[#c8c8d8]/30">{session.label}</span>
        </div>
        <div className="flex-1 overflow-hidden p-1">
          <MockTerminal lines={terminalLines(session)} />
        </div>
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="group relative flex w-1 shrink-0 cursor-col-resize items-center justify-center bg-border transition-colors hover:bg-primary/40"
      />

      {/* Right: context pane */}
      <div className="flex flex-1 overflow-hidden">
        <ContextPane session={session} onSessionCreated={onSessionCreated} />
      </div>
    </div>
  );
}
