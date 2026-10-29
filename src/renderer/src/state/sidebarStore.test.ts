import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  useSidebarStore,
} from './sidebarStore';

const store = () => useSidebarStore.getState();

describe('sidebar width', () => {
  it('defaults to 280px whatever the content', () => {
    expect(SIDEBAR_DEFAULT_WIDTH_PX).toBe(280);
    expect(store().width).toBe(SIDEBAR_DEFAULT_WIDTH_PX);
  });

  it('stays within its bounds and leaves the workspace 560px', () => {
    expect(clampSidebarWidth(5000, 1440)).toBe(SIDEBAR_MAX_WIDTH_PX);
    expect(clampSidebarWidth(10, 1440)).toBe(SIDEBAR_MIN_WIDTH_PX);
    expect(clampSidebarWidth(500, 960)).toBe(400);
    // A window too narrow for both still keeps the sidebar usable.
    expect(clampSidebarWidth(300, 600)).toBe(SIDEBAR_MIN_WIDTH_PX);
  });

  it('stores a requested width within the fixed bounds', () => {
    store().setWidth(9999);
    expect(store().width).toBe(SIDEBAR_MAX_WIDTH_PX);
    store().setWidth(331.6);
    expect(store().width).toBe(332);
  });
});

describe('sidebar search toggle (OS-global shortcut)', () => {
  beforeEach(() => store().setCollapsed(false));

  it('collapses an expanded sidebar without a focus request', () => {
    const before = store().searchFocusRequest;
    store().toggleSearch();
    expect(store().collapsed).toBe(true);
    expect(store().searchFocusRequest).toBe(before);
  });

  it('expands a collapsed sidebar and asks for search focus', () => {
    store().setCollapsed(true);
    const before = store().searchFocusRequest;
    store().toggleSearch();
    expect(store().collapsed).toBe(false);
    expect(store().searchFocusRequest).toBe(before + 1);
  });

  it('reveal always expands and focuses (tray, Cmd+K)', () => {
    const before = store().searchFocusRequest;
    store().revealSearch();
    expect(store().collapsed).toBe(false);
    expect(store().searchFocusRequest).toBe(before + 1);
  });
});
