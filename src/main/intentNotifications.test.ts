import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ Notification: class {} }));

const { isIntentSurfaceVisible } = await import('./intentNotifications');

describe('isIntentSurfaceVisible', () => {
  const shown = { windowFocused: true, windowVisible: true, visibleArchitectKey: 'a' };

  it('suppresses only when the window is in front and showing that project', () => {
    expect(isIntentSurfaceVisible(shown, 'a')).toBe(true);
    expect(isIntentSurfaceVisible(shown, 'b')).toBe(false);
    expect(isIntentSurfaceVisible({ ...shown, windowFocused: false }, 'a')).toBe(false);
    expect(isIntentSurfaceVisible({ ...shown, windowVisible: false }, 'a')).toBe(false);
    expect(isIntentSurfaceVisible({ ...shown, visibleArchitectKey: null }, 'a')).toBe(false);
  });
});
