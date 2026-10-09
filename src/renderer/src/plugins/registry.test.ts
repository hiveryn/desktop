import { describe, expect, it } from 'vitest';
import { getTabPlugin } from './registry';

describe('getTabPlugin', () => {
  it('knows the native right-pane tabs', () => {
    for (const type of ['kanban', 'event-log', 'ticket', 'terminal', 'git-diff', 'action']) {
      expect(getTabPlugin(type)).toBeDefined();
    }
  });

  it('ignores a leftover files tab from tabs.yaml instead of rendering it', () => {
    expect(getTabPlugin('files')).toBeUndefined();
  });
});
