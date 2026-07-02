import * as React from 'react';
import { Diff, Hunk, parseDiff, tokenize, useTokenizeWorker } from 'react-diff-view';
import type { DiffType, HunkData } from 'react-diff-view';
import 'react-diff-view/style/index.css';
import { languageForPath, refractor, registerLanguages } from './languages';
import type { DiffSectionKind, DiffViewFile, DiffViewSection } from './types';
import styles from './DiffView.module.css';

registerLanguages();

const SPLIT_MIN_WIDTH = 900;
// Above this many changed lines, tokenize off the main thread.
const WORKER_LINE_THRESHOLD = 1500;

const SECTION_LABEL: Record<DiffSectionKind, string> = {
  staged: 'staged',
  unstaged: 'unstaged',
  combined: 'diff',
};

export interface DiffViewProps {
  file: DiffViewFile;
  viewMode?: 'unified' | 'split';
  onViewModeChange?: (mode: 'unified' | 'split') => void;
  defaultViewMode?: 'unified' | 'split';
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countChangedLines(hunks: HunkData[]): number {
  let total = 0;
  for (const hunk of hunks) total += hunk.changes.length;
  return total;
}

function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: 'unified' | 'split';
  onChange: (mode: 'unified' | 'split') => void;
}) {
  return (
    <div className={styles.viewToggle} role="group" aria-label="Diff view mode">
      <button
        type="button"
        className={styles.viewToggleButton}
        data-active={viewMode === 'unified' || undefined}
        onClick={() => onChange('unified')}
      >
        Unified
      </button>
      <button
        type="button"
        className={styles.viewToggleButton}
        data-active={viewMode === 'split' || undefined}
        onClick={() => onChange('split')}
      >
        Split
      </button>
    </div>
  );
}

function SyncTokenizedDiff({
  hunks,
  diffType,
  viewType,
  language,
}: {
  hunks: HunkData[];
  diffType: DiffType;
  viewType: 'unified' | 'split';
  language: string | undefined;
}) {
  const tokens = React.useMemo(() => {
    if (!language) return null;
    try {
      return tokenize(hunks, { highlight: true, refractor, language });
    } catch {
      return null;
    }
  }, [hunks, language]);

  return (
    <div className={styles.diffScroll} data-diff-type={diffType}>
      <Diff viewType={viewType} diffType={diffType} hunks={hunks} tokens={tokens} optimizeSelection>
        {(renderHunks) => renderHunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
      </Diff>
    </div>
  );
}

function WorkerTokenizedDiff({
  hunks,
  diffType,
  viewType,
  language,
}: {
  hunks: HunkData[];
  diffType: DiffType;
  viewType: 'unified' | 'split';
  language: string | undefined;
}) {
  const [worker] = React.useState(
    () => new Worker(new URL('./tokenize.worker.ts', import.meta.url), { type: 'module' }),
  );
  React.useEffect(() => () => worker.terminate(), [worker]);

  const { tokens } = useTokenizeWorker(worker, { hunks, oldSource: null, language });

  return (
    <div className={styles.diffScroll} data-diff-type={diffType}>
      <Diff viewType={viewType} diffType={diffType} hunks={hunks} tokens={tokens} optimizeSelection>
        {(renderHunks) => renderHunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
      </Diff>
    </div>
  );
}

function DiffSectionBlock({
  path,
  section,
  viewMode,
  onViewModeChange,
  canSplit,
}: {
  path: string;
  section: DiffViewSection;
  viewMode: 'unified' | 'split';
  onViewModeChange: (mode: 'unified' | 'split') => void;
  canSplit: boolean;
}) {
  const effectiveViewMode = canSplit ? viewMode : 'unified';

  let body: React.ReactNode;
  if (section.isBinary) {
    body = <div className={styles.note}>Binary file diff not shown.</div>;
  } else if (section.truncated) {
    body = (
      <div className={styles.note}>
        Diff too large to display ({formatBytes(section.rawDiffBytes)}) — truncated by the daemon.
      </div>
    );
  } else {
    body = (
      <ParsedDiffBody
        rawUnifiedDiff={section.rawUnifiedDiff}
        path={path}
        viewType={effectiveViewMode}
      />
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionKind} data-kind={section.kind}>
          {SECTION_LABEL[section.kind]}
        </span>
        <span className={styles.sectionStats}>
          <span className={styles.additions}>+{section.additions}</span>
          <span className={styles.deletions}>-{section.deletions}</span>
        </span>
        <div className={styles.sectionHeaderActions}>
          {canSplit && !section.isBinary && !section.truncated && (
            <ViewModeToggle viewMode={effectiveViewMode} onChange={onViewModeChange} />
          )}
        </div>
      </div>
      {body}
    </div>
  );
}

function ParsedDiffBody({
  rawUnifiedDiff,
  path,
  viewType,
}: {
  rawUnifiedDiff: string;
  path: string;
  viewType: 'unified' | 'split';
}) {
  const parsed = React.useMemo(() => {
    try {
      const [file] = parseDiff(rawUnifiedDiff, { nearbySequences: 'zip' });
      return file ?? null;
    } catch {
      return null;
    }
  }, [rawUnifiedDiff]);

  if (!parsed) {
    return <pre className={styles.rawFallback}>{rawUnifiedDiff}</pre>;
  }

  const language = languageForPath(path);
  const totalLines = countChangedLines(parsed.hunks);

  if (totalLines > WORKER_LINE_THRESHOLD) {
    return (
      <WorkerTokenizedDiff
        hunks={parsed.hunks}
        diffType={parsed.type}
        viewType={viewType}
        language={language}
      />
    );
  }

  return (
    <SyncTokenizedDiff hunks={parsed.hunks} diffType={parsed.type} viewType={viewType} language={language} />
  );
}

export function DiffView({
  file,
  viewMode: viewModeProp,
  onViewModeChange,
  defaultViewMode = 'unified',
  className,
}: DiffViewProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState<number | null>(null);
  const [internalViewMode, setInternalViewMode] = React.useState<'unified' | 'split'>(defaultViewMode);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const canSplit = containerWidth === null || containerWidth >= SPLIT_MIN_WIDTH;
  const viewMode = viewModeProp ?? internalViewMode;
  const handleViewModeChange = onViewModeChange ?? setInternalViewMode;

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(' ')}>
      {file.sections.map((section) => (
        <DiffSectionBlock
          key={`${file.path}-${section.kind}`}
          path={file.path}
          section={section}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          canSplit={canSplit}
        />
      ))}
    </div>
  );
}
