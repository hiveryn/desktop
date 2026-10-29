import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_WORKSPACE_MIN_PX,
} from '../../../state/sidebarStore';

// Vitest stubs CSS imports, so the stylesheet is read as text.
const css = readFileSync(new URL('./SessionSidebar.module.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} rule`);
  return css.slice(start, css.indexOf('\n}', start));
}

// Regression: with `flex: 0 0 34ch` and no width/min-width, the sidebar's
// automatic flex minimum was its min-content — an unbroken nowrap worker title
// (plus machine tag, elapsed and conclude) — which pushed it past the window
// width (measured 1596px in a 1440px window). The width must be explicit and
// the automatic minimum disabled, with the same bounds as the store.
describe('sidebar width contract', () => {
  const sidebar = rule('.sidebar');

  it('never sizes itself from its content', () => {
    expect(sidebar).toMatch(/flex: 0 0 auto;/);
    expect(sidebar).toMatch(/min-width: 0;/);
    expect(sidebar).toMatch(/overflow: hidden;/);
  });

  it('clamps to the store bounds and keeps the workspace minimum', () => {
    expect(sidebar).toContain(
      `width: clamp(${SIDEBAR_MIN_WIDTH_PX}px, var(--sidebar-width, ${SIDEBAR_DEFAULT_WIDTH_PX}px), min(${SIDEBAR_MAX_WIDTH_PX}px, 100vw - ${SIDEBAR_WORKSPACE_MIN_PX}px));`,
    );
  });

  it('truncates long names; the name keeps a readable minimum', () => {
    const name = rule('.name');
    expect(name).toMatch(/text-overflow: ellipsis;/);
    expect(name).toMatch(/white-space: nowrap;/);
    expect(rule('.machine')).toMatch(/flex-shrink: 1;/);
  });
});
