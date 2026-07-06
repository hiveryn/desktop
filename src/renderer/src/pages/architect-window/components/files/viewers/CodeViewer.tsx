import { refractor, registerLanguages } from '@renderer/components/DiffView/languages';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { renderHast, splitHastLines } from '../hastToReact';
import type { ViewerProps } from '../viewerRegistry';
import styles from './Viewers.module.css';

registerLanguages();

// Above these bounds highlighting is skipped and the file renders as plain
// text — the daemon's 2 MiB read cap bounds the worst case, but tokenizing
// hundreds of KB on the main thread would still jank the UI.
const HIGHLIGHT_MAX_BYTES = 512 * 1024;
const HIGHLIGHT_MAX_LINES = 10_000;

export default function CodeViewer({ file, text, language, scrollRef }: ViewerProps) {
  const lines = useMemo<ReactNode[][]>(() => {
    if (text === null) {
      throw new Error(`CodeViewer requires decoded text for ${file.path}`);
    }
    const plainLines = text.split('\n');
    const skipHighlight =
      !language ||
      !refractor.registered(language) ||
      text.length > HIGHLIGHT_MAX_BYTES ||
      plainLines.length > HIGHLIGHT_MAX_LINES;
    if (skipHighlight) {
      return plainLines.map((line) => [line]);
    }
    return splitHastLines(refractor.highlight(text, language)).map((lineNodes, i) =>
      renderHast(lineNodes, `${i}-`),
    );
  }, [text, language, file.path]);

  return (
    <pre ref={scrollRef} className={styles.code}>
      <code>
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and the text is immutable per mount
          <span key={i} className={styles.codeLine}>
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}
