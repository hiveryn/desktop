import { create } from 'zustand';
import type { ArchitectStatus } from '../../../shared/types';

// Every configured architect with its running sessions (GET
// /api/architects/status): the sidebar's list and the launcher view. Loaded by
// the workbench's poller; listings resolve latest-wins, so a slow response can
// never replace a newer one.
interface ArchitectStatusState {
  statuses: ArchitectStatus[];
  loaded: boolean;
  // When the listing shown was requested — elapsed durations are computed
  // against it.
  listedAt: number;
  refresh(): Promise<void>;
}

let sequence = 0;
let applied = 0;

export const useArchitectStatusStore = create<ArchitectStatusState>((set) => ({
  statuses: [],
  loaded: false,
  listedAt: 0,
  async refresh() {
    const token = ++sequence;
    const requestedAt = Date.now();
    // A failure is captured centrally by the request bridge; the last list stays.
    const statuses = await window.hiveryn.architects.status().catch(() => null);
    if (statuses === null || token < applied) return;
    applied = token;
    set({ statuses, loaded: true, listedAt: requestedAt });
  },
}));
