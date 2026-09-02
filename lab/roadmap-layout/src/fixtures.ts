// Hand-written fixtures shaped exactly like shared/domain/roadmap.ts's wire
// types (RoadmapItem / RoadmapTicketInfo / RoadmapArchiveEntrySummary /
// RoadmapArchiveEntry) — this lab has no runtime dependency on @hiveryn/shared
// (its imports there are type-only and compile away), so the shapes are
// inlined here instead.

export interface RoadmapItem {
  id: string;
  kind: 'goal' | 'initiative' | 'milestone';
  title: string;
  status: 'planned' | 'active' | 'blocked' | 'done';
  outcome: string;
  parent_id: string | null;
  order: number;
  success_criteria: string[];
  tickets: string[];
  depends_on: string[];
}

export interface RoadmapTicketInfo {
  id: string;
  title: string;
  status: 'backlog' | 'progress' | 'done';
  repo?: string;
  additional_repos: string[];
  has_conclusion: boolean;
  conclusion_outcome?: 'completed' | 'exploratory' | 'rejected';
}

export const DEEP_ITEMS: RoadmapItem[] = [
  {
    id: 'ide-grade-review',
    kind: 'goal',
    title: 'Make Hiveryn sufficient for daily code review',
    status: 'active',
    outcome: 'Engineers can inspect and approve agent work without another IDE.',
    parent_id: null,
    order: 10,
    success_criteria: [
      'Working-tree and concluded-ticket diffs are reviewable.',
      'Files and search cover normal investigation.',
    ],
    tickets: ['2026-08-20-1127-show-concluded-ticket-commit-diffs-in-a-changes-tab'],
    depends_on: [],
  },
  {
    id: 'conclusion-diffs',
    kind: 'milestone',
    title: 'Review every concluded ticket commit',
    status: 'done',
    outcome: 'Concluded tickets expose all recorded commit diffs.',
    parent_id: 'ide-grade-review',
    order: 10,
    success_criteria: [],
    tickets: ['2026-08-20-1127-show-concluded-ticket-commit-diffs-in-a-changes-tab'],
    depends_on: [],
  },
  {
    id: 'roadmap-review',
    kind: 'initiative',
    title: 'Ship a review-oriented roadmap surface',
    status: 'active',
    outcome: 'Kareem can review architect-maintained roadmap state from the desktop.',
    parent_id: 'ide-grade-review',
    order: 20,
    success_criteria: ['Hierarchy, detail, and live updates all work.'],
    tickets: [],
    depends_on: ['conclusion-diffs'],
  },
  {
    id: 'roadmap-desktop-tab',
    kind: 'milestone',
    title: 'Add the desktop Roadmap tab',
    status: 'blocked',
    outcome: 'A native tab renders the current and archived roadmap.',
    parent_id: 'roadmap-review',
    order: 10,
    success_criteria: [],
    tickets: [
      '2026-08-31-0757-add-a-structured-roadmap-with-reversible-current-and-archive-lifecycle',
      '2026-09-01-0000-does-not-exist',
    ],
    depends_on: ['missing-dependency-id'],
  },
  {
    id: 'roadmap-live-events',
    kind: 'milestone',
    title: 'Roadmap mutations reach the desktop live',
    status: 'planned',
    outcome: 'A daemon SSE event reconciles the tab on every mutation.',
    parent_id: 'roadmap-review',
    order: 20,
    success_criteria: [],
    tickets: [],
    depends_on: ['roadmap-desktop-tab'],
  },
  {
    id: 'observability',
    kind: 'goal',
    title: 'Full request/error observability everywhere',
    status: 'planned',
    outcome: 'Every daemon call is inspectable from the desktop.',
    parent_id: null,
    order: 20,
    success_criteria: [],
    tickets: [],
    depends_on: [],
  },
];

export const TICKETS: RoadmapTicketInfo[] = [
  {
    id: '2026-08-20-1127-show-concluded-ticket-commit-diffs-in-a-changes-tab',
    title: 'Show concluded ticket commit diffs in a Changes tab',
    status: 'done',
    repo: 'desktop',
    additional_repos: [],
    has_conclusion: true,
    conclusion_outcome: 'completed',
  },
  {
    id: '2026-08-31-0757-add-a-structured-roadmap-with-reversible-current-and-archive-lifecycle',
    title: 'Add a structured roadmap with reversible current and archive lifecycle',
    status: 'done',
    repo: 'daemon',
    additional_repos: ['shared'],
    has_conclusion: true,
    conclusion_outcome: 'completed',
  },
  // roadmap-desktop-tab links a second ticket id that resolves to nothing —
  // exercises the "ticket not found" fallback row.
];

export const EMPTY_ITEMS: RoadmapItem[] = [];

export const ARCHIVE_ENTRIES = [
  {
    root_id: 'legacy-onboarding',
    root_title: 'Streamline first-run onboarding',
    root_kind: 'goal' as const,
    archived_at: '2026-07-01T10:00:00Z',
    summary: 'Superseded by the launcher redesign.',
    item_count: 4,
  },
];

export const ARCHIVE_SUBTREE: RoadmapItem[] = [
  {
    id: 'legacy-onboarding',
    kind: 'goal',
    title: 'Streamline first-run onboarding',
    status: 'done',
    outcome: 'New users reach a working session in under two minutes.',
    parent_id: null,
    order: 10,
    success_criteria: [],
    tickets: [],
    depends_on: [],
  },
  {
    id: 'legacy-onboarding-wizard',
    kind: 'milestone',
    title: 'Launcher first-run wizard',
    status: 'done',
    outcome: 'First launch walks through profile + architect setup.',
    parent_id: 'legacy-onboarding',
    order: 10,
    success_criteria: [],
    tickets: [],
    depends_on: [],
  },
];
