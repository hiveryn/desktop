import * as React from 'react';
import { createPortal } from 'react-dom';
import type { ArchitectStatus, ArchitectStatusSession } from '../../../../shared/types';
import { formatElapsed } from '../../lib/formatElapsed';
import styles from './CommandPalette.module.css';

const REFRESH_INTERVAL_MS = 5000;

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type PaletteRow =
  | { kind: 'architect'; architect: ArchitectStatus; active: boolean }
  | { kind: 'session'; architect: ArchitectStatus; session: ArchitectStatusSession };

function rowKey(row: PaletteRow): string {
  return row.kind === 'architect' ? `architect:${row.architect.key}` : `session:${row.session.id}`;
}

// An architect is active when it has a running architect session (`status`
// is the agent_status of that session, null when none is running) or any
// running worker sessions — not just when worker sessions are present, since
// a freshly-restarted architect may be running with no workers spawned yet.
function isArchitectActive(architect: ArchitectStatus): boolean {
  return architect.status !== null || architect.sessions.length > 0;
}

function buildRows(statuses: ArchitectStatus[], query: string): PaletteRow[] {
  const q = query.toLowerCase().trim();
  const active: ArchitectStatus[] = [];
  const inactive: ArchitectStatus[] = [];
  for (const architect of statuses) {
    if (isArchitectActive(architect)) active.push(architect);
    else inactive.push(architect);
  }

  const rows: PaletteRow[] = [];
  for (const architect of [...active, ...inactive]) {
    const isActive = isArchitectActive(architect);
    if (!q) {
      rows.push({ kind: 'architect', architect, active: isActive });
      for (const session of architect.sessions) {
        rows.push({ kind: 'session', architect, session });
      }
      continue;
    }

    const keyMatches = architect.key.toLowerCase().includes(q);
    const matchingSessions = architect.sessions.filter((s) => s.title.toLowerCase().includes(q));
    if (!keyMatches && matchingSessions.length === 0) continue;

    rows.push({ kind: 'architect', architect, active: isActive });
    for (const session of keyMatches ? architect.sessions : matchingSessions) {
      rows.push({ kind: 'session', architect, session });
    }
  }
  return rows;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [statuses, setStatuses] = React.useState<ArchitectStatus[]>([]);
  const [now, setNow] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeItemRef = React.useRef<HTMLLIElement>(null);

  const rows = React.useMemo(() => buildRows(statuses, query), [statuses, query]);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = (): void => {
      void window.hiveryn.architects.status().then((result) => {
        if (cancelled) return;
        setStatuses(result);
        setNow(Date.now());
      });
    };
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open]);

  React.useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  React.useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const confirm = (index: number): void => {
    const row = rows[index];
    if (!row) return;
    if (row.kind === 'architect') {
      if (!row.active) return;
      void window.hiveryn.palette.focusArchitect(row.architect.key);
    } else {
      void window.hiveryn.palette.focusArchitect(row.architect.key, row.session.id);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        confirm(activeIndex);
        break;
    }
  };

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className={styles.searchRow}>
          <span className={styles.prompt}>▸</span>
          <input
            ref={inputRef}
            className={styles.searchInput}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="search architects and sessions..."
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        {rows.length > 0 ? (
          <ul className={styles.list} role="listbox">
            {rows.map((row, i) => {
              const isActive = i === activeIndex;
              if (row.kind === 'architect') {
                const itemClass = [
                  styles.item,
                  styles.architectRow,
                  isActive ? styles.itemActive : undefined,
                  !row.active ? styles.inactive : undefined,
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li
                    key={rowKey(row)}
                    ref={isActive ? activeItemRef : undefined}
                    role="option"
                    aria-selected={isActive}
                    className={itemClass}
                    onClick={() => confirm(i)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <span className={styles.itemName}>{row.architect.name ?? row.architect.key}</span>
                    <span className={styles.itemMeta}>
                      <span className={styles.itemStatus}>
                        {row.active ? (row.architect.status ?? '—') : '(inactive)'}
                      </span>
                    </span>
                  </li>
                );
              }

              const itemClass = [styles.item, styles.sessionRow, isActive ? styles.itemActive : undefined]
                .filter(Boolean)
                .join(' ');
              return (
                <li
                  key={rowKey(row)}
                  ref={isActive ? activeItemRef : undefined}
                  role="option"
                  aria-selected={isActive}
                  className={itemClass}
                  onClick={() => confirm(i)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className={styles.itemName}>→ {row.session.title}</span>
                  <span className={styles.itemMeta}>
                    <span className={styles.itemElapsed}>
                      {formatElapsed(row.session.started_at, now)}
                    </span>
                    <span className={styles.itemStatus}>{row.session.agent_status}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.empty}>no architects or sessions match</div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
