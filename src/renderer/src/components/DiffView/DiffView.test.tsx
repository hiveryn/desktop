import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiffView } from './DiffView';
import type { DiffViewFile } from './types';

const file: DiffViewFile = {
  path: 'a.ts',
  status: 'modified',
  sections: [
    {
      kind: 'unstaged',
      additions: 1,
      deletions: 1,
      isBinary: false,
      truncated: false,
      rawDiffBytes: 0,
      rawUnifiedDiff: [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1 +1 @@',
        '-const a = 1;',
        `+const a = '${'x'.repeat(400)}';`,
        '',
      ].join('\n'),
    },
  ],
};

describe('DiffView', () => {
  it('wraps long lines by default', () => {
    expect(renderToStaticMarkup(<DiffView file={file} />)).toContain('data-wrap="true"');
  });

  it('scrolls horizontally when wrapping is off', () => {
    const html = renderToStaticMarkup(<DiffView file={file} wrapLines={false} />);
    expect(html).toContain('x'.repeat(400));
    expect(html).not.toContain('data-wrap');
  });
});
