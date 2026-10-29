import { describe, expect, it } from 'vitest';
import { boardView, describeBoardError } from './boardStatus';

describe('boardView', () => {
  it('loads before the first board arrives', () => {
    expect(boardView({ loaded: false, loading: true, error: null })).toEqual({ kind: 'loading' });
  });

  it('shows an actionable error, not an empty board, when the first load fails', () => {
    const error = new Error(
      'The daemon did not answer GET /api/architects/ai-platform/tickets within 15s',
    );
    expect(boardView({ loaded: false, loading: false, error })).toEqual({
      kind: 'error',
      error: 'The daemon did not answer GET /api/architects/ai-platform/tickets within 15s',
    });
  });

  it('keeps the last board visible and marks it stale when a refresh fails', () => {
    expect(boardView({ loaded: true, loading: false, error: new Error('boom') })).toEqual({
      kind: 'board',
      stale: true,
      error: 'boom',
    });
  });

  it('keeps showing a loaded board while a retry is in flight', () => {
    expect(boardView({ loaded: true, loading: true, error: null })).toEqual({
      kind: 'board',
      stale: false,
    });
  });
});

describe('describeBoardError', () => {
  it('prefixes the daemon error code', () => {
    const error = Object.assign(new Error('architect not found'), { code: 'NOT_FOUND' });
    expect(describeBoardError(error)).toBe('NOT_FOUND: architect not found');
  });

  it('describes non-Error values', () => {
    expect(describeBoardError('Missing architect key')).toBe('Missing architect key');
  });
});
