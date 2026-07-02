import { useMemo } from 'react';
import { classify, formatBytes } from './classify';
import styles from './FileViewer.module.css';
import { useFileContent } from './useFileContent';
import { viewerRegistry } from './viewerRegistry';

interface Props {
  path: string;
  refreshSeq: number;
  onOpenFile?(path: string): void;
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export default function FileViewer({ path, refreshSeq, onOpenFile }: Props) {
  const { data, loading, error } = useFileContent(path, refreshSeq);
  const classified = useMemo(() => (data ? classify(data) : null), [data]);

  if (error) {
    return <div className={styles.message}>Failed to load file — see error center</div>;
  }
  if (!data || !classified) {
    return loading ? <div className={styles.message}>Loading file…</div> : null;
  }

  const Viewer = viewerRegistry.get(classified.kind);
  if (!Viewer) {
    throw new Error(`No viewer registered for kind "${classified.kind}" (${path})`);
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.header}>
        <span className={styles.name} title={path}>
          {fileName(path)}
        </span>
        <span className={styles.meta}>
          {data.contentType} · {formatBytes(data.size)}
        </span>
      </div>
      {data.truncated && classified.text !== null && (
        <div className={styles.truncatedBanner}>
          Showing the first {formatBytes(data.bytes.byteLength)} of {formatBytes(data.size)} — the
          daemon caps file reads at 2 MiB.
        </div>
      )}
      <div className={styles.body}>
        <Viewer
          file={data}
          text={classified.text}
          language={classified.language}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  );
}
