import * as React from 'react';
import type { AgentProfile, ArchitectStatus } from '../../../../shared/types';
import { formatElapsed } from '../../lib/formatElapsed';
import paletteStyles from '../palette/palette.module.css';
import { buildRows, type PaletteRow, rowKey } from '../palette/rows';
import ProfileSelector from '../ProfileSelector/ProfileSelector';
import styles from './TrayPalette.module.css';

const REFRESH_INTERVAL_MS = 5000;

function errorText(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

const TrayPalette: React.FC = () => {
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
  const searchRowRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);
  const visibleRef = React.useRef(true);

  const rows = React.useMemo(() => buildRows(statuses, query), [statuses, query]);

  const loadStatuses = React.useCallback((): void => {
    window.hiveryn.architects
      .status()
      .then((result) => {
        setStatuses(result);
        setNow(Date.now());
      })
      .catch(setError);
  }, []);

  // Initial data + profile list.
  React.useEffect(() => {
    loadStatuses();
    window.hiveryn.profiles.list().then(setProfiles).catch(setError);
  }, [loadStatuses]);

  // Refresh whenever the popover is shown, and reset transient UI state.
  React.useEffect(() => {
    const offShown = window.hiveryn.tray.onShown(() => {
      visibleRef.current = true;
      setQuery('');
      setActiveIndex(0);
      setError(null);
      setPendingKey(null);
      setShowProfileSelector(false);
      setSpawning(false);
      loadStatuses();
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    const handleBlur = (): void => {
      visibleRef.current = false;
    };
    window.addEventListener('blur', handleBlur);
    return () => {
      offShown();
      window.removeEventListener('blur', handleBlur);
    };
  }, [loadStatuses]);

  // Poll while visible so a session that finishes mid-view updates.
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (visibleRef.current) loadStatuses();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadStatuses]);

  React.useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  React.useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Report natural content height so the main process can size the window to
  // fit (it caps the height, after which the body scrolls). The body clips with
  // overflow, but `scrollHeight` still reports its full content height.
  React.useEffect(() => {
    const searchH = searchRowRef.current?.offsetHeight ?? 0;
    const bodyH = bodyRef.current?.scrollHeight ?? 0;
    const errorH = errorRef.current?.offsetHeight ?? 0;
    // +2 for the panel's top/bottom borders.
    void window.hiveryn.tray.setHeight(searchH + bodyH + errorH + 2);
  }, [rows, error, showProfileSelector, spawning]);

  const confirm = (index: number): void => {
    const row: PaletteRow | undefined = rows[index];
    if (!row) return;
    if (row.kind === 'session') {
      window.hiveryn.palette
        .focusArchitect(row.architect.key, row.session.id)
        .then(() => window.hiveryn.tray.hide())
        .catch(setError);
      return;
    }
    if (row.active) {
      window.hiveryn.palette
        .focusArchitect(row.architect.key)
        .then(() => window.hiveryn.tray.hide())
        .catch(setError);
      return;
    }
    // Inactive architect — spawn a new session via the profile selector.
    setError(null);
    setPendingKey(row.architect.key);
    setShowProfileSelector(true);
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
        await window.hiveryn.tray.hide();
      } catch (err) {
        setError(err);
        setSpawning(false);
      }
    })();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case 'Escape':
        void window.hiveryn.tray.hide();
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

  return (
    <div className={styles.panel} role="dialog" aria-label="Architect palette">
      <div className={styles.searchRow} ref={searchRowRef}>
        <span className={paletteStyles.prompt}>▸</span>
        <input
          ref={inputRef}
          className={paletteStyles.searchInput}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="search architects and sessions..."
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
      </div>
      <div className={styles.body} ref={bodyRef}>
        {rows.length > 0 ? (
          <ul className={styles.list} role="listbox">
            {rows.map((row, i) => {
              const isActive = i === activeIndex;
              if (row.kind === 'architect') {
                const itemClass = [
                  paletteStyles.item,
                  paletteStyles.architectRow,
                  isActive ? paletteStyles.itemActive : undefined,
                  !row.active ? paletteStyles.inactive : undefined,
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
                    <span className={paletteStyles.itemName}>
                      {row.architect.name ?? row.architect.key}
                    </span>
                    <span className={paletteStyles.itemMeta}>
                      <span className={paletteStyles.itemStatus}>
                        {row.active ? (row.architect.status ?? '—') : '(inactive)'}
                      </span>
                    </span>
                  </li>
                );
              }

              const itemClass = [
                paletteStyles.item,
                paletteStyles.sessionRow,
                isActive ? paletteStyles.itemActive : undefined,
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
                  <span className={paletteStyles.itemName}>→ {row.session.title}</span>
                  <span className={paletteStyles.itemMeta}>
                    <span className={paletteStyles.itemElapsed}>
                      {formatElapsed(row.session.started_at, now)}
                    </span>
                    <span className={paletteStyles.itemStatus}>{row.session.agent_status}</span>
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
      </div>
      {error ? (
        <div className={styles.error} ref={errorRef}>
          {errorText(error)}
        </div>
      ) : null}
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
    </div>
  );
};

export default TrayPalette;
