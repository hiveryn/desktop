import { Claude, Codex, OpenCode } from '@lobehub/icons';
import { z } from 'zod';

export const AGENT_KINDS = ['claude', 'codex', 'opencode'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

// Each icon export IS the Mono variant — .Color/.Avatar etc are attached as properties
export const AGENT_KIND_ICONS = {
  claude: Claude,
  codex: Codex,
  opencode: OpenCode,
} as const;

export const KIND_STYLES: Record<string, string> = {
  claude: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  codex: 'bg-green-500/15 text-green-600 dark:text-green-400',
  opencode: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

export const AGENT_PLACEHOLDERS: Record<AgentKind, { name: string; args: string; env: string }> = {
  claude: {
    name: 'Claude Opus',
    args: '--permission-mode\nplan\n--model\nopus',
    env: '',
  },
  codex: {
    name: 'Codex Personal',
    args: '--model\ngpt-5.4',
    env: 'CODEX_HOME=~/.codex',
  },
  opencode: {
    name: 'Copilot',
    args: '--model\ngithub-copilot/gpt-5.4\n--agent\nplan',
    env: 'XDG_DATA_HOME=~/.opencode/data',
  },
};

export const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  agent_kind: z.enum(AGENT_KINDS),
  args_text: z.string(),
  env_text: z.string().refine(
    (text) =>
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .every((l) => l.indexOf('=') > 0),
    { message: 'Each line must be KEY=VALUE' },
  ),
});

export type FormValues = z.infer<typeof formSchema>;

export function parseArgs(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1);
    }
  }
  return env;
}

export function argsSummary(args: string[]): string {
  if (args.length === 0) return 'no args';
  const preview = args.slice(0, 2).join(' ');
  return args.length > 2 ? `${preview} +${args.length - 2}` : preview;
}
