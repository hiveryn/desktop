import styles from './Breadcrumb.module.css';

interface Props {
  rootPath: string;
  currentDir: string;
  onNavigate(path: string): void;
}

interface Segment {
  label: string;
  path: string;
}

// Segments below the root only — the root picker already names the root, so
// repeating it here would read as a duplicate. The leading "/" navigates back
// to the root.
function segmentsFor(rootPath: string, currentDir: string): Segment[] {
  if (currentDir === rootPath) return [];
  if (!currentDir.startsWith(rootPath.endsWith('/') ? rootPath : `${rootPath}/`)) {
    throw new Error(`breadcrumb: current dir ${currentDir} is outside root ${rootPath}`);
  }
  const segments: Segment[] = [];
  let acc = rootPath;
  for (const part of currentDir.slice(rootPath.length).split('/').filter(Boolean)) {
    acc = acc.endsWith('/') ? `${acc}${part}` : `${acc}/${part}`;
    segments.push({ label: part, path: acc });
  }
  return segments;
}

export default function Breadcrumb({ rootPath, currentDir, onNavigate }: Props) {
  const segments = segmentsFor(rootPath, currentDir);
  return (
    <nav className={styles.breadcrumb} aria-label="Current directory">
      <button
        type="button"
        className={styles.segment}
        data-current={segments.length === 0 || undefined}
        title="Root"
        onClick={() => onNavigate(rootPath)}
      >
        /
      </button>
      {segments.map((segment, i) => (
        <span key={segment.path} className={styles.segmentWrap}>
          {i > 0 && (
            <span className={styles.separator} aria-hidden="true">
              /
            </span>
          )}
          <button
            type="button"
            className={styles.segment}
            data-current={i === segments.length - 1 || undefined}
            onClick={() => onNavigate(segment.path)}
          >
            {segment.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
