import { Close, Glyph, IconButton, SidebarToggle } from '@components';
import type { SessionType } from '@hiveryn/shared/domain';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ArchitectStatus } from '../../../../../shared/types';
import { formatElapsed } from '../../../lib/formatElapsed';
import { useArchitectStatusStore } from '../../../state/architectStatusStore';
import { useSessionStore } from '../../../state/sessionStore';
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_WORKSPACE_MIN_PX,
  useSidebarStore,
} from '../../../state/sidebarStore';
import { focusActivePane } from '../focusActivePane';
import { selectSession } from '../navigation';
import { useArchitectLaunch } from './launchArchitect';
import { architectInitial, buildRows, rowKey, type SidebarRow } from './rows';
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
  const setCollapsed = useSidebarStore((s) => s.setCollapsed);
  const width = useSidebarStore((s) => s.width);
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
  // The rail lists every architect in the unfiltered sidebar order.
  const railArchitects = useMemo(
    () => buildRows(statuses, '').flatMap((row) => (row.kind === 'architect' ? [row] : [])),
    [statuses],
  );

  // Collapsing unmounts the search field; a keyboard user who had it focused
  // gets the workspace back instead of a focus-less document.
  useEffect(() => {
    if (!collapsed) return;
    const active = document.activeElement;
    if (!active || active === document.body) focusActivePane();
  }, [collapsed]);

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

  // Pointer selection: switches the workspace; the sidebar stays as it is.
  const select = (row: SidebarRow): void => {
    if (row.kind === 'session') {
      void selectSession(row.architect.key, row.session.id);
    } else {
      void openArchitect(row.architect);
    }
  };

  // Keyboard confirmation (Enter): select, then collapse the sidebar and hand
  // the keys to the shown workspace — only once the selection actually took
  // effect. An inactive architect opens the variant pick; the launch collapses
  // on success. A failed selection (reported to the error center) leaves the
  // sidebar and its search as they are; Enter never reaches a terminal.
  const confirm = async (index: number): Promise<void> => {
    const row = rows[index];
    if (!row) return;
    const shown =
      row.kind === 'session'
        ? selectSession(row.architect.key, row.session.id)
        : openArchitect(row.architect, { collapse: true });
    const target = row.kind === 'session' ? row.session.id : row.architect.session_id;
    // A newer selection meanwhile (rapid navigation) owns the workspace now.
    if (!(await shown) || useSessionStore.getState().activeSessionId !== target) return;
    setQuery('');
    setCursor(-1);
    setCollapsed(true);
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
        void confirm(cursor < 0 ? 0 : cursor);
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
        <nav className={styles.railBody} aria-label="Architects">
          <ul className={styles.railList}>
            {railArchitects.map(({ architect, active }) => {
              const sessionId = architect.session_id;
              const record = sessionId ? sessions[sessionId] : undefined;
              const indicator = architectIndicator(
                sessionId !== null,
                record?.status ?? architect.status,
              );
              const attention = [sessionId, ...architect.sessions.map((s) => s.id)].some((id) =>
                attentionFor(id),
              );
              const workers = architect.sessions.length;
              const isSelectedProject = architect.key === selectedArchitectKey;
              const label = [
                architectName(architect),
                indicator.label,
                workers > 0 ? `${workers} worker${workers === 1 ? '' : 's'} running` : null,
                launchingKey === architect.key ? 'launching…' : null,
                attention ? 'needs attention' : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={architect.key}>
                  <button
                    type="button"
                    className={styles.railItem}
                    data-project={isSelectedProject || undefined}
                    data-inactive={!active || undefined}
                    aria-current={isSelectedProject ? 'true' : undefined}
                    aria-label={label}
                    title={label}
                    onClick={() => void openArchitect(architect)}
                  >
                    <span className={styles.railInitial} aria-hidden="true">
                      {architectInitial(architectName(architect))}
                    </span>
                    <span
                      className={styles.railStatus}
                      data-status={indicator.kind}
                      aria-hidden="true"
                    />
                    {attention && <span className={styles.railAttention} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    );
  }

  return (
    <aside
      className={styles.sidebar}
      aria-label="Sessions"
      style={{ '--sidebar-width': `${width}px` } as CSSProperties}
    >
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
                      <span className={styles.name} title={architectName(architect)}>
                        {architectName(architect)}
                      </span>
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
                    {machine && (
                      <span className={styles.machine} title={machine}>
                        {machine}
                      </span>
                    )}
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
      <ResizeHandle width={width} />
    </aside>
  );
}

// Drag (or arrow keys) on the sidebar's right edge sets its width within the
// bounds; a double click restores the default.
function ResizeHandle({ width }: { width: number }) {
  const setWidth = useSidebarStore((s) => s.setWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  // The window width bounds the applied width; follow it so the reported value
  // and every drag start from what is on screen.
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const applied = clampSidebarWidth(width, windowWidth);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: applied };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    setWidth(
      clampSidebarWidth(
        drag.current.startWidth + e.clientX - drag.current.startX,
        window.innerWidth,
      ),
    );
  };
  const endDrag = (): void => {
    drag.current = null;
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable window splitter has no native element
    <div
      className={styles.resizeHandle}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={applied}
      aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
      aria-valuemax={Math.min(SIDEBAR_MAX_WIDTH_PX, windowWidth - SIDEBAR_WORKSPACE_MIN_PX)}
      title="Drag to resize · double-click to reset"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH_PX)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const delta = e.key === 'ArrowLeft' ? -step : step;
          setWidth(clampSidebarWidth(applied + delta, window.innerWidth));
        }
      }}
    />
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
