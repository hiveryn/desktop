// Per-row tree decorations, assembled in FilesPane from three sources and
// keyed by absolute path: git porcelain status (repos:status), agent-touch
// timestamps (session tool events), and unsaved editor buffers
// (editorBuffers' dirty registry).

export interface RowDecoration {
  /** Porcelain status char for files: M / A / D / R / C / ?. */
  status?: string;
  /** Directory containing changed descendants (dim rollup dot). */
  statusDir?: boolean;
  /** ms epoch of the agent's last edit to this file — renders a fading dot. */
  touchedAt?: number;
  /** Unsaved editor buffer. */
  dirty?: boolean;
}

export type RowDecorations = ReadonlyMap<string, RowDecoration>;

export const EMPTY_DECORATIONS: RowDecorations = new Map();

// Porcelain columns → single display char. Worktree column wins when both
// sides changed (it's what the user sees on disk); untracked shows "?".
export function statusChar(index: string, worktree: string): string {
  if (index === '?' || worktree === '?') return '?';
  if (worktree !== ' ' && worktree !== '') return worktree;
  return index;
}
