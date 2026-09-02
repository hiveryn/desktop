import { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import RoadmapArchiveList from '../../../src/renderer/src/pages/architect-window/components/Roadmap/RoadmapArchiveList';
import RoadmapDetail from '../../../src/renderer/src/pages/architect-window/components/Roadmap/RoadmapDetail';
import RoadmapTree from '../../../src/renderer/src/pages/architect-window/components/Roadmap/RoadmapHierarchy';
import {
  buildRoadmapTree,
  flattenRoadmapTree,
} from '../../../src/renderer/src/pages/architect-window/components/Roadmap/roadmapTree';
import { ARCHIVE_ENTRIES, ARCHIVE_SUBTREE, DEEP_ITEMS, EMPTY_ITEMS, TICKETS } from './fixtures';
import './lab.css';

const WIDE_MIN_WIDTH = 640;

type FixtureName = 'deep' | 'empty';

function Harness() {
  const [frameWidth, setFrameWidth] = useState(1100);
  const [fixture, setFixture] = useState<FixtureName>('deep');
  const [view, setView] = useState<'current' | 'archive'>('current');
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>('ide-grade-review');
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  const items = fixture === 'deep' ? DEEP_ITEMS : EMPTY_ITEMS;
  const currentItems = view === 'current' ? items : selectedRootId ? ARCHIVE_SUBTREE : [];
  const rows = useMemo(
    () => flattenRoadmapTree(buildRoadmapTree(currentItems as never), collapsedIds),
    [currentItems, collapsedIds],
  );
  const selectedItem = currentItems.find((i) => i.id === selectedId) ?? null;

  const wide = frameWidth >= WIDE_MIN_WIDTH;

  const toggleCollapse = (id: string): void => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Archive has two nav levels: compact root list, then (once a root is
  // picked) that root's full subtree — same RoadmapTree the current view
  // uses. "current" never has a root-list level.
  const treeAndArchive =
    view === 'current' ? (
      <RoadmapTree
        rows={rows as never}
        cursorKey={selectedId}
        selectedId={selectedId}
        onToggle={toggleCollapse}
        onSelect={setSelectedId}
      />
    ) : selectedRootId ? (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <button
          type="button"
          onClick={() => {
            setSelectedRootId(null);
            setSelectedId(null);
          }}
          style={{ margin: '0.5em', alignSelf: 'flex-start' }}
        >
          ← archived roots
        </button>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <RoadmapTree
            rows={rows as never}
            cursorKey={selectedId}
            selectedId={selectedId}
            onToggle={toggleCollapse}
            onSelect={setSelectedId}
          />
        </div>
      </div>
    ) : (
      <RoadmapArchiveList
        entries={ARCHIVE_ENTRIES as never}
        selectedRootId={selectedRootId}
        cursorKey={selectedRootId}
        onSelect={setSelectedRootId}
      />
    );

  const detail = selectedItem ? (
    <RoadmapDetail
      item={selectedItem as never}
      items={currentItems as never}
      tickets={TICKETS as never}
      onSelectItem={setSelectedId}
      onOpenTicket={(id) => alert(`would open TicketDetail for ${id}`)}
    />
  ) : (
    <div style={{ padding: '2em', color: 'var(--theme-text-muted)' }}>
      {view === 'archive' && !selectedRootId
        ? 'Select an archived root to see its subtree.'
        : 'Select an item.'}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div
        style={{
          display: 'flex',
          gap: '1em',
          alignItems: 'center',
          padding: '0.5em 1em',
          borderBottom: '1px solid var(--theme-border)',
          flexWrap: 'wrap',
        }}
      >
        <strong>Roadmap layout lab</strong>
        <label>
          frame width: {frameWidth}px
          <input
            type="range"
            min={320}
            max={1400}
            value={frameWidth}
            onChange={(e) => setFrameWidth(Number(e.target.value))}
            style={{ marginLeft: '0.5em', verticalAlign: 'middle' }}
          />
        </label>
        <button type="button" onClick={() => setFrameWidth(1100)}>
          preset: wide
        </button>
        <button type="button" onClick={() => setFrameWidth(380)}>
          preset: narrow
        </button>
        <button type="button" onClick={() => setFixture(fixture === 'deep' ? 'empty' : 'deep')}>
          fixture: {fixture}
        </button>
        <button
          type="button"
          onClick={() => {
            setView(view === 'current' ? 'archive' : 'current');
            setSelectedRootId(null);
            setSelectedId(null);
          }}
        >
          view: {view}
        </button>
        <span style={{ color: 'var(--theme-text-subtle)' }}>
          {wide ? 'wide split' : 'narrow drill-in'}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          overflow: 'auto',
          padding: '1em',
        }}
      >
        <div
          style={{
            width: frameWidth,
            maxWidth: '100%',
            height: '100%',
            border: '1px dashed var(--theme-border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--theme-background)',
          }}
        >
          {wide ? (
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div
                style={{
                  width: '18rem',
                  flexShrink: 0,
                  borderRight: '1px solid var(--theme-border)',
                  overflow: 'auto',
                }}
              >
                {treeAndArchive}
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>{detail}</div>
            </div>
          ) : selectedId ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                style={{ margin: '0.5em', alignSelf: 'flex-start' }}
              >
                ← back
              </button>
              <div style={{ flex: 1, overflow: 'auto' }}>{detail}</div>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto' }}>{treeAndArchive}</div>
          )}
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('missing #root');
ReactDOM.createRoot(rootEl).render(<Harness />);
