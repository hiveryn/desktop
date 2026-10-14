// How the architect window's ticket board is shown, from what the last
// listing attempts produced. A failed refresh never hides a board that loaded:
// the last successful board stays visible with the failure explained.
export type BoardView =
  | { kind: 'loading' }
  | { kind: 'board'; stale: false }
  | { kind: 'board'; stale: true; error: string }
  | { kind: 'error'; error: string };

export interface BoardStatusInput {
  // A board has loaded successfully at least once for this architect.
  loaded: boolean;
  loading: boolean;
  error: unknown | null;
}

export function boardView({ loaded, loading, error }: BoardStatusInput): BoardView {
  if (loaded) {
    return error == null
      ? { kind: 'board', stale: false }
      : { kind: 'board', stale: true, error: describeBoardError(error) };
  }
  if (loading) return { kind: 'loading' };
  if (error != null) return { kind: 'error', error: describeBoardError(error) };
  return { kind: 'loading' };
}

// The original error text, prefixed with the daemon's error code when it has
// one, so the cause stays visible without the error center.
export function describeBoardError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === 'string' && code !== '' ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}
