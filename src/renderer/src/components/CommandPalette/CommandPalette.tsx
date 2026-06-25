import * as React from 'react';
import { createPortal } from 'react-dom';
import type { AgentProfile, ArchitectStatus } from '../../../../shared/types';
import { formatElapsed } from '../../lib/formatElapsed';
import ProfileSelector from '../ProfileSelector/ProfileSelector';
import styles from './CommandPalette.module.css';
import { buildRows, rowKey } from './rows';

const REFRESH_INTERVAL_MS = 5000;

function errorText(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [statuses, setStatuses] = React.useState<ArchitectStatus[]>([]);
  const [profiles, setProfiles] = React.useState<AgentProfile[]>([]);
  const [now, setNow] = React.useState(0);
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [showProfileSelector, setShowProfileSelector] = React.useState(false);
  const [spawning, setSpawning] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeItemRef = React.useRef<HTMLLIElement>(null);

  const rows = React.useMemo(() => buildRows(statuses, query), [statuses, query]);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setPendingKey(null);
      setShowProfileSelector(false);
      setSpawning(false);
      setError(null);
      window.hiveryn.profiles.list().then(setProfiles).catch(setError);
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
      if (!row.active) {
        // Inactive architect — spawn a new session via the profile selector.
        setError(null);
        setPendingKey(row.architect.key);
        setShowProfileSelector(true);
        return;
      }
      void window.hiveryn.palette.focusArchitect(row.architect.key);
    } else {
      void window.hiveryn.palette.focusArchitect(row.architect.key, row.session.id);
    }
    onClose();
  };

  const handleProfileSelect = (profileName: string): void => {
    const key = pendingKey;
    if (!key) return;
    setShowProfileSelector(false);
    setSpawning(true);
    setError(null);
    void (async (): Promise<void> => {
      try {
        const intent = await window.hiveryn.sessions.create('architect', key);
        await window.hiveryn.sessions.createRun(intent.id, profileName);
        await window.hiveryn.launcher.openArchitect(key);
        onClose();
      } catch (err) {
        setError(err);
        setSpawning(false);
      }
    })();
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
          <div className={styles.empty}>
            {spawning ? 'spawning session…' : 'no architects or sessions match'}
          </div>
        )}
        {error ? <div className={styles.error}>{errorText(error)}</div> : null}
      </div>
      <ProfileSelector
        profiles={profiles}
        open={showProfileSelector}
        onClose={() => {
          if (!spawning) {
            setShowProfileSelector(false);
            setPendingKey(null);
          }
        }}
        onSelect={handleProfileSelect}
      />
    </div>,
    document.body,
  );
};

export default CommandPalette;
