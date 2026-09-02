import { Refresh } from '@components';
import type { RoadmapItem, RoadmapView } from '@hiveryn/shared/domain';
import { ARCHITECT_EVENT_TYPE } from '@hiveryn/shared/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STREAM_CONNECTED_EVENT_TYPE } from '../../../../../../shared/types';
import type { ShortcutConfig } from '../../../../hooks/useShortcutConfig';
import { createChordMatcher } from '../../../../keys/chords';
import { registerDynamicHandler } from '../../../../keys/dispatcher';
import { isTextInputFocused, matchesShortcut } from '../../../../keys/matchers';
import { ROADMAP_BINDING_DEFAULTS, resolveBindings } from '../../../../keys/paneBindings';
import { useRoadmapStore } from '../../../../state/roadmapStore';
import { useSessionStore } from '../../../../state/sessionStore';
import RoadmapArchiveList from './RoadmapArchiveList';
import RoadmapDetail from './RoadmapDetail';
import RoadmapHierarchy from './RoadmapHierarchy';
import styles from './RoadmapPane.module.css';
import { buildRoadmapTree, flattenRoadmapTree } from './roadmapTree';

const REFETCH_DEBOUNCE_MS = 500;
const WIDE_MIN_WIDTH = 640;
const CHORD_TIMEOUT_MS = 1000;
const JUMP_ROWS = 6;

interface Props {
  architectKey: string | undefined;
  isActive: boolean;
  shortcutConfig: ShortcutConfig | null;
  onTicketReference(ticketId: string): void;
}

// The daemon authors this shape; a mismatch is a bug, not a rendering
// fallback — fail loud rather than render a garbage tree (mirrors
// git-diff's assertDiffData).
function assertRoadmapView(
  data: unknown,
  view: 'current' | 'archive',
  focused: boolean,
): asserts data is RoadmapView {
  if (typeof data !== 'object' || data === null) {
    throw new TypeError('roadmap response is not an object');
  }
  const v = data as Record<string, unknown>;
  if (typeof v.version !== 'string') throw new TypeError('roadmap response missing version');
  if (!Array.isArray(v.tickets)) throw new TypeError('roadmap response missing tickets array');
  if (!Array.isArray(v.warnings)) throw new TypeError('roadmap response missing warnings array');
  if (view === 'current') {
    if (!Array.isArray(v.items))
      throw new TypeError('roadmap current response missing items array');
  } else if (focused) {
    if (typeof v.archive_entry !== 'object' || v.archive_entry === null) {
      throw new TypeError('roadmap archive response missing archive_entry');
    }
  } else if (!Array.isArray(v.archive_entries)) {
    throw new TypeError('roadmap archive response missing archive_entries array');
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'NOT_FOUND';
}

function wrapIndex(idx: number, delta: number, len: number): number {
  if (len === 0) return -1;
  const base = idx === -1 ? (delta > 0 ? -1 : 0) : idx;
  return (base + delta + len) % len;
}

export default function RoadmapPane({
  architectKey,
  isActive,
  shortcutConfig,
  onTicketReference,
}: Props) {
  const view = useRoadmapStore((s) => s.view);
  const setView = useRoadmapStore((s) => s.setView);
  const selectedItemId = useRoadmapStore((s) => s.selectedItemId);
  const setSelectedItemId = useRoadmapStore((s) => s.setSelectedItemId);
  const selectedArchiveRootId = useRoadmapStore((s) => s.selectedArchiveRootId);
  const setSelectedArchiveRootId = useRoadmapStore((s) => s.setSelectedArchiveRootId);
  const collapsedIds = useRoadmapStore((s) => s.collapsedIds);
  const toggleCollapsed = useRoadmapStore((s) => s.toggleCollapsed);

  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const wide = paneWidth === null || paneWidth >= WIDE_MIN_WIDTH;

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setPaneWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const focused = view === 'archive' && selectedArchiveRootId !== null;
  const contextKey = architectKey
    ? JSON.stringify([architectKey, view, focused ? selectedArchiveRootId : null])
    : null;

  const [result, setResult] = useState<{
    contextKey: string;
    data: RoadmapView | null;
    loading: boolean;
    error: unknown;
  } | null>(null);
  const requestTokenRef = useRef(0);

  const currentResult = result?.contextKey === contextKey ? result : null;
  const data = currentResult?.data ?? null;
  const loading = currentResult?.loading ?? contextKey !== null;
  const error = currentResult?.error ?? null;

  const refetch = useCallback(async () => {
    if (!architectKey || !contextKey) return;
    const token = ++requestTokenRef.current;
    setResult((prev) => ({
      contextKey,
      data: prev?.contextKey === contextKey ? prev.data : null,
      loading: true,
      error: null,
    }));
    try {
      const params =
        view === 'current'
          ? ({ view: 'current' } as const)
          : selectedArchiveRootId
            ? ({ view: 'archive', id: selectedArchiveRootId } as const)
            : ({ view: 'archive' } as const);
      const next = await window.hiveryn.roadmap.read(architectKey, params);
      assertRoadmapView(next, view, focused);
      if (requestTokenRef.current !== token) return;
      setResult({ contextKey, data: next, loading: false, error: null });
    } catch (err) {
      if (requestTokenRef.current !== token) return;
      // The drilled-into archive root was restored back to Current while we
      // were viewing it — go back to the root list instead of showing a
      // hard error for state that simply moved.
      if (isNotFound(err) && focused) {
        setSelectedArchiveRootId(null);
        return;
      }
      setResult((prev) => ({
        contextKey,
        data: prev?.contextKey === contextKey ? prev.data : null,
        loading: false,
        error: err,
      }));
    }
  }, [architectKey, contextKey, view, selectedArchiveRootId, focused, setSelectedArchiveRootId]);

  useEffect(() => {
    if (isActive) void refetch();
  }, [isActive, refetch]);

  // Live consistency: any roadmap mutation (architect MCP, any repo) or a
  // stream reconnect (no backlog — must reconcile, not just listen) refetches
  // whatever this pane is currently looking at. Not gated on isActive: a
  // mutation while the tab is in the background must not go unnoticed.
  useEffect(() => {
    if (!architectKey) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = window.hiveryn.architects.subscribeEvents(architectKey, (event) => {
      if (event.type === STREAM_CONNECTED_EVENT_TYPE) {
        void refetch();
        return;
      }
      if (event.type !== ARCHITECT_EVENT_TYPE || event.reason !== 'roadmap_updated') return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void refetch(), REFETCH_DEBOUNCE_MS);
    });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [architectKey, refetch]);

  const items: RoadmapItem[] = useMemo(() => {
    if (!data) return [];
    return view === 'current' ? data.items : (data.archive_entry?.items ?? []);
  }, [data, view]);

  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

  // A refetch can drop the item currently shown in the detail panel (it was
  // just archived out of Current, or the daemon simply no longer has it) —
  // clear the stale selection with a visible notice rather than showing
  // detail for an item that no longer exists in this view.
  useEffect(() => {
    if (!data || !selectedItemId) return;
    if (!items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
      setSelectionNotice('The previously selected item is no longer in this view.');
    }
  }, [data, items, selectedItemId, setSelectedItemId]);

  const tree = useMemo(() => buildRoadmapTree(items), [items]);
  const rows = useMemo(() => flattenRoadmapTree(tree, collapsedIds), [tree, collapsedIds]);

  const showingArchiveRoots = view === 'archive' && !selectedArchiveRootId;
  const archiveEntries = data?.archive_entries ?? [];

  // ── Keyboard cursor (unifies the archive-root list and the tree rows) ────
  const [cursorKey, setCursorKey] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: view/selectedArchiveRootId are trigger deps, not read inside the effect
  useEffect(() => {
    setCursorKey(null);
  }, [view, selectedArchiveRootId]);

  const navKeys = showingArchiveRoots
    ? archiveEntries.map((e) => e.root_id)
    : rows.map((r) => r.key);

  const selectCursor = (key: string): void => {
    setCursorKey(key);
    if (showingArchiveRoots) setSelectedArchiveRootId(key);
    else {
      setSelectedItemId(key);
      setSelectionNotice(null);
    }
  };

  const isRoadmapFocused = useSessionStore((s) => s.focusedPane === 'right-roadmap');
  const shortcutConfigRef = useRef(shortcutConfig);
  shortcutConfigRef.current = shortcutConfig;
  const navKeysRef = useRef(navKeys);
  navKeysRef.current = navKeys;
  const cursorKeyRef = useRef(cursorKey);
  cursorKeyRef.current = cursorKey;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const showingArchiveRootsRef = useRef(showingArchiveRoots);
  showingArchiveRootsRef.current = showingArchiveRoots;
  const selectCursorRef = useRef(selectCursor);
  selectCursorRef.current = selectCursor;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const chordRef = useRef(createChordMatcher(CHORD_TIMEOUT_MS));

  useEffect(() => {
    if (!isRoadmapFocused) return;
    return registerDynamicHandler((e) => {
      const cfg = shortcutConfigRef.current;
      if (!cfg) return 'passthrough';
      if (e.repeat) return 'passthrough';
      if (isTextInputFocused()) return 'passthrough';
      if (e.metaKey || e.ctrlKey || e.altKey) return 'passthrough';

      const bindings = resolveBindings(cfg.roadmap, ROADMAP_BINDING_DEFAULTS);
      chordRef.current.begin(e);

      const keys = navKeysRef.current;
      const idx = cursorKeyRef.current === null ? -1 : keys.indexOf(cursorKeyRef.current);

      const topMatch = chordRef.current.match(bindings.top);
      if (topMatch !== 'no') {
        if (topMatch === 'matched' && keys.length > 0) setCursorKey(keys[0]);
        return 'consumed';
      }
      if (matchesShortcut(e, bindings.bottom)) {
        if (keys.length > 0) setCursorKey(keys[keys.length - 1]);
        return 'consumed';
      }
      if (matchesShortcut(e, bindings.refresh)) {
        void refetchRef.current();
        return 'consumed';
      }
      if (matchesShortcut(e, bindings['toggle-archive'])) {
        setView(view === 'current' ? 'archive' : 'current');
        return 'consumed';
      }
      if (matchesShortcut(e, bindings.down)) {
        const next = wrapIndex(idx, 1, keys.length);
        if (next !== -1) setCursorKey(keys[next]);
        return 'consumed';
      }
      if (matchesShortcut(e, bindings.up)) {
        const next = wrapIndex(idx, -1, keys.length);
        if (next !== -1) setCursorKey(keys[next]);
        return 'consumed';
      }
      if (matchesShortcut(e, bindings['jump-down'])) {
        if (keys.length > 0) setCursorKey(keys[Math.min(idx + JUMP_ROWS, keys.length - 1)]);
        return 'consumed';
      }
      if (matchesShortcut(e, bindings['jump-up'])) {
        const start = idx === -1 ? keys.length : idx;
        if (keys.length > 0) setCursorKey(keys[Math.max(start - JUMP_ROWS, 0)]);
        return 'consumed';
      }
      if (matchesShortcut(e, bindings.open) || e.key === 'Enter') {
        if (cursorKeyRef.current) selectCursorRef.current(cursorKeyRef.current);
        return 'consumed';
      }
      if (!showingArchiveRootsRef.current) {
        if (matchesShortcut(e, bindings.right)) {
          const row = rowsRef.current.find((r) => r.key === cursorKeyRef.current);
          if (row && row.node.children.length > 0 && !row.expanded) toggleCollapsed(row.key);
          return 'consumed';
        }
        if (matchesShortcut(e, bindings.left)) {
          const row = rowsRef.current.find((r) => r.key === cursorKeyRef.current);
          if (row) {
            if (row.node.children.length > 0 && row.expanded) toggleCollapsed(row.key);
            else if (row.parentKey !== null) setCursorKey(row.parentKey);
          }
          return 'consumed';
        }
      }

      return 'passthrough';
    });
  }, [isRoadmapFocused, view, setView, toggleCollapsed]);

  // ── Keep the cursor row scrolled into view ─────────────────────────────────
  const rowRefsMap = useRef(new Map<string, HTMLElement>());
  const setRowRef = useCallback((key: string, node: HTMLElement | null) => {
    if (node) rowRefsMap.current.set(key, node);
    else rowRefsMap.current.delete(key);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: navKeys is a trigger dep, read via rowRefsMap
  useEffect(() => {
    if (!cursorKey) return;
    rowRefsMap.current.get(cursorKey)?.scrollIntoView({ block: 'nearest' });
  }, [cursorKey, navKeys]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  const handleOpenTicket = (ticketId: string): void => {
    onTicketReference(ticketId);
  };

  const heading = data?.title ?? 'Roadmap';

  const header = (
    <header className={styles.header}>
      <span className={styles.title}>{heading}</span>
      <div className={styles.viewSwitch} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'current'}
          className={styles.viewButton}
          data-active={view === 'current' || undefined}
          onClick={() => setView('current')}
        >
          Current
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'archive'}
          className={styles.viewButton}
          data-active={view === 'archive' || undefined}
          onClick={() => setView('archive')}
        >
          Archive
        </button>
      </div>
      <button
        type="button"
        className={styles.refreshButton}
        onClick={() => void refetch()}
        aria-label="Refresh roadmap"
        title="Refresh roadmap"
      >
        <Refresh />
      </button>
    </header>
  );

  if (error && !data) {
    return (
      <div className={styles.pane}>
        {header}
        <div className={styles.errorBlock}>
          <span>Failed to load roadmap: {errorText(error)}</span>
          <button type="button" className={styles.retryButton} onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className={styles.pane}>
        {header}
        <span className={styles.loading}>Loading roadmap…</span>
      </div>
    );
  }

  if (!data) return <div className={styles.pane}>{header}</div>;

  const hierarchyPane = showingArchiveRoots ? (
    <RoadmapArchiveList
      entries={archiveEntries}
      selectedRootId={selectedArchiveRootId}
      cursorKey={cursorKey}
      onSelect={(id) => selectCursor(id)}
      setRowRef={setRowRef}
    />
  ) : (
    <>
      {view === 'archive' && (
        <button
          type="button"
          className={styles.backButton}
          onClick={() => setSelectedArchiveRootId(null)}
        >
          ← archived roots
        </button>
      )}
      <RoadmapHierarchy
        rows={rows}
        cursorKey={cursorKey}
        selectedId={selectedItemId}
        onToggle={toggleCollapsed}
        onSelect={(id) => selectCursor(id)}
        setRowRef={setRowRef}
      />
    </>
  );

  const detailPane = selectedItem ? (
    <RoadmapDetail
      item={selectedItem}
      items={items}
      tickets={data.tickets}
      onSelectItem={(id) => selectCursor(id)}
      onOpenTicket={handleOpenTicket}
    />
  ) : (
    <div className={styles.emptyDetail}>
      {view === 'archive' && showingArchiveRoots
        ? 'Select an archived root to see its subtree.'
        : 'Select an item to see its details.'}
    </div>
  );

  return (
    <div className={styles.pane} ref={paneRef}>
      {header}
      {error != null && (
        <div className={styles.errorBanner}>
          <span>Refresh failed: {errorText(error)}</span>
          <button type="button" className={styles.retryButton} onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}
      {selectionNotice && (
        <div className={styles.noticeBanner}>
          <span>{selectionNotice}</span>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => setSelectionNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      {view === 'current' && items.length === 0 ? (
        <div className={styles.empty}>No roadmap items.</div>
      ) : wide ? (
        <div className={styles.workspace}>
          <aside className={styles.hierarchyPane}>{hierarchyPane}</aside>
          <div className={styles.detailPane}>{detailPane}</div>
        </div>
      ) : selectedItem ? (
        <div className={styles.narrowDetail}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => {
              setSelectedItemId(null);
              setSelectionNotice(null);
            }}
          >
            ← back
          </button>
          <div className={styles.detailPane}>{detailPane}</div>
        </div>
      ) : (
        <div className={styles.hierarchyPane}>{hierarchyPane}</div>
      )}
    </div>
  );
}
