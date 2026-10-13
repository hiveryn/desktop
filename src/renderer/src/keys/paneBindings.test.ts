import { describe, expect, it } from 'vitest';
import { GIT_DIFF_BINDING_DEFAULTS, resolveBindings } from './paneBindings';

describe('git-diff toggle-wrap binding', () => {
  it('defaults to w and follows a user override', () => {
    expect(resolveBindings(undefined, GIT_DIFF_BINDING_DEFAULTS)['toggle-wrap']).toBe('w');
    expect(
      resolveBindings({ 'toggle-wrap': 'shift+w' }, GIT_DIFF_BINDING_DEFAULTS)['toggle-wrap'],
    ).toBe('shift+w');
  });

  it('does not collide with another default git-diff binding', () => {
    const keys = Object.values(GIT_DIFF_BINDING_DEFAULTS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
