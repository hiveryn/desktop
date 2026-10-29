import { Close, Glyph, IconButton, SidebarToggle } from '@components';
import type { SessionType } from '@hiveryn/shared/domain';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ArchitectStatus } from '../../../../../shared/types';
import { formatElapsed } from '../../../lib/formatElapsed';
import { useArchitectStatusStore } from '../../../state/architectStatusStore';
import { useSessionStore } from '../../../state/sessionStore';
import { useSidebarStore } from '../../../state/sidebarStore';
import { focusActivePane } from '../focusActivePane';
import { selectSession } from '../navigation';
import { useArchitectLaunch } from './launchArchitect';
import { buildRows, rowKey, type SidebarRow } from './rows';
import styles from './SessionSidebar.module.css';
import {
  architectIndicator,
  needsAttention,
  type StatusIndicator,
  workerIndicator,
} from './sidebarModel';

// A session the conclude dialog can end.
export interface ConcludeTarget {
  id: string;
  type: SessionType;
  label: string;
}

interface Props {
  onConclude(target: ConcludeTarget): void;
}

function StatusIcon({ indicator }: { indicator: StatusIndicator }) {
  const Icon = indicator.icon;
  return (
    <span
      className={styles.status}
      data-status={indicator.kind}
      role="img"
      aria-label={indicator.label}
      title={indicator.label}
    >
      <Icon />
    </span>
  );
}

function architectName(architect: ArchitectStatus): string {
  return architect.name || architect.key;
}

// The collapsible session sidebar: every architect (active ones first) with its
// running workers indented beneath, searchable like the former palette.
// Selecting a row switches the workspace in place.
export default function SessionSidebar({ onConclude }: Props) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const searchFocusRequest = useSidebarStore((s) => s.searchFocusRequest);

  const statuses = useArchitectStatusStore((s) => s.statuses);
  const loaded = useArchitectStatusStore((s) => s.loaded);
  const listedAt = useArchitectStatusStore((s) => s.listedAt);

  const sessions = useSessionStore((s) => s.sessions);
  const selectedArchitectKey = useSessionStore((s) => s.selectedArchitectKey);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const pendingIntents = useSessionStore((s) => s.pendingIntents);
  const questions = useSessionStore((s) => s.questions);

  const launchingKey = useArchitectLaunch((s) => s.launchingKey);
  const openArchitect = useArchitectLaunch((s) => s.open);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRowRef = useRef<HTMLLIElement>(null);

  const rows = useMemo(() => buildRows(statuses, query), [statuses, query]);

  // Expand + focus requests (in-app binding, OS-global shortcut, tray icon).
  useEffect(() => {
    if (searchFocusRequest === 0) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [searchFocusRequest]);

  useEffect(() => {
    setCursor((prev) => Math.min(prev, rows.length - 1));
  }, [rows.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cursor is the trigger; the ref is read inside.
  useEffect(() => {
    cursorRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const attentionFor = (sessionId: string | null): boolean =>
    sessionId !== null && needsAttention(sessionId, activeSessionId, pendingIntents, questions);

  const select = (row: SidebarRow): void => {
    if (row.kind === 'session') {
      void selectSession(row.architect.key, row.session.id);
    } else {
      openArchitect(row.architect);
    }
  };

  // Selecting by keyboard hands the keys back to the workspace.
  const confirm = (index: number): void => {
    const row = rows[index];
    if (!row) return;
    select(row);
    inputRef.current?.blur();
    setQuery('');
    setCursor(-1);
    focusActivePane();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setCursor((i) => Math.min(i + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setCursor((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        confirm(cursor < 0 ? 0 : cursor);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (query) {
          setQuery('');
          setCursor(-1);
        } else {
          inputRef.current?.blur();
          focusActivePane();
        }
        break;
    }
  };

  const projectAttention = rows.some((row) =>
    row.kind === 'session' ? attentionFor(row.session.id) : attentionFor(row.architect.session_id),
  );

  if (collapsed) {
    return (
      <aside className={styles.rail} aria-label="Sessions (collapsed)">
        <IconButton
          className={styles.toggle}
          onClick={toggleCollapsed}
          aria-label="Expand sidebar"
          aria-expanded={false}
          title="Expand sidebar"
        >
          <Glyph>
            <SidebarToggle />
          </Glyph>
        </IconButton>
        {projectAttention && (
          <span
            className={styles.notifyDot}
            role="img"
            aria-label="A session needs attention"
            title="A session needs attention"
          />
        )}
      </aside>
    );
  }

  return (
    <aside className={styles.sidebar} aria-label="Sessions">
      <div className={styles.searchRow}>
        <IconButton
          className={styles.toggle}
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar"
          aria-expanded={true}
          title="Collapse sidebar"
        >
          <Glyph>
            <SidebarToggle />
          </Glyph>
        </IconButton>
        <span className={styles.prompt} aria-hidden="true">
          ▸
        </span>
        <input
          ref={inputRef}
          className={styles.searchInput}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(e.target.value ? 0 : -1);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setCursor(-1)}
          placeholder="search…"
          aria-label="Search architects and sessions"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <nav className={styles.body} aria-label="Architects and sessions">
        {rows.length > 0 ? (
          <ul className={styles.list}>
            {rows.map((row, i) => {
              const isCursor = i === cursor;
              if (row.kind === 'architect') {
                const architect = row.architect;
                const sessionId = architect.session_id;
                const record = sessionId ? sessions[sessionId] : undefined;
                const indicator = architectIndicator(
                  sessionId !== null,
                  record?.status ?? architect.status,
                );
                const isSelectedProject = architect.key === selectedArchitectKey;
                const isCurrent =
                  isSelectedProject && sessionId !== null && sessionId === activeSessionId;
                const launching = launchingKey === architect.key;
                return (
                  <li
                    key={rowKey(row)}
                    ref={isCursor ? cursorRowRef : undefined}
                    className={styles.row}
                    data-kind="architect"
                    data-cursor={isCursor || undefined}
                    data-current={isCurrent || undefined}
                    data-project={isSelectedProject || undefined}
                    data-inactive={!row.active || undefined}
                    onMouseMove={() => setCursor(i)}
                  >
                    <button
                      type="button"
                      className={styles.rowButton}
                      aria-current={isCurrent ? 'page' : undefined}
                      onClick={() => select(row)}
                    >
                      <StatusIcon indicator={indicator} />
                      <span className={styles.name}>{architectName(architect)}</span>
                      {launching && <span className={styles.meta}>launching…</span>}
                      {attentionFor(sessionId) && (
                        <span
                          className={styles.notifyDot}
                          role="img"
                          aria-label="Needs attention"
                          title="Needs attention"
                        />
                      )}
                    </button>
                    {sessionId && (
                      <ConcludeButton
                        label={`Conclude ${architectName(architect)} architect session`}
                        onClick={() =>
                          onConclude({
                            id: sessionId,
                            type: 'architect',
                            label: `${architectName(architect)} architect`,
                          })
                        }
                      />
                    )}
                  </li>
                );
              }

              const session = row.session;
              const record = sessions[session.id];
              const machine = record?.machine ?? session.machine;
              const indicator = workerIndicator(
                record ? record.status : session.agent_status,
                machine,
                record?.connection ?? session.connection,
              );
              const isCurrent = session.id === activeSessionId;
              return (
                <li
                  key={rowKey(row)}
                  ref={isCursor ? cursorRowRef : undefined}
                  className={styles.row}
                  data-kind="session"
                  data-cursor={isCursor || undefined}
                  data-current={isCurrent || undefined}
                  onMouseMove={() => setCursor(i)}
                >
                  <button
                    type="button"
                    className={styles.rowButton}
                    aria-current={isCurrent ? 'page' : undefined}
                    title={session.title}
                    onClick={() => select(row)}
                  >
                    <StatusIcon indicator={indicator} />
                    <span className={styles.name}>{session.title}</span>
                    {machine && <span className={styles.machine}>{machine}</span>}
                    <span className={styles.meta}>
                      {formatElapsed(session.started_at, listedAt)}
                    </span>
                    {attentionFor(session.id) && (
                      <span
                        className={styles.notifyDot}
                        role="img"
                        aria-label="Needs attention"
                        title="Needs attention"
                      />
                    )}
                  </button>
                  <ConcludeButton
                    label={`Conclude ${session.title}`}
                    onClick={() =>
                      onConclude({ id: session.id, type: 'ticket', label: session.title })
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.empty}>
            {!loaded
              ? 'loading architects…'
              : query
                ? 'no architects or sessions match'
                : 'no architects configured'}
          </div>
        )}
      </nav>
    </aside>
  );
}

function ConcludeButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      className={styles.conclude}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Close />
    </button>
  );
}
