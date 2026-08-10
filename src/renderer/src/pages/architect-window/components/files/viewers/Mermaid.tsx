import { useEffect, useId, useState } from 'react';
import styles from './Viewers.module.css';

// Loaded lazily — mermaid is a heavy dependency and most markdown files
// don't contain diagrams. Initialized once, on first diagram.
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'dark',
        fontFamily: 'var(--font-family-mono)',
        // On a parse error, mermaid's default is to append a global "bomb"
        // error diagram to document.body — outside this component, polluting
        // the whole window. The catch below already renders the error inline.
        suppressErrorRendering: true,
      });
      return mod.default;
    });
  }
  return mermaidPromise;
}

interface Props {
  code: string;
}

export default function Mermaid({ code }: Props) {
  // Mermaid requires a DOM-safe unique id for its temp render element.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);
    loadMermaid()
      .then((mermaid) => mermaid.render(`mermaid-${id}`, code))
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className={styles.mermaidError}>
        <span>mermaid: {error}</span>
        <pre>{code}</pre>
      </div>
    );
  }
  if (!svg) {
    return <div className={styles.mermaidLoading}>Rendering diagram…</div>;
  }
  return (
    <div
      className={styles.mermaid}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: svg comes from mermaid rendering local file content, not remote input
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
