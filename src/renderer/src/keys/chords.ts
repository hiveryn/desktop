// Chord bindings are space-separated key sequences ("g g"). A matcher owns
// the pending-prefix state for one key handler: call begin(event) exactly
// once per event before any match() calls — it snapshots and clears the
// pending prefix, so a key that neither continues nor restarts a chord is
// handled normally. Shared by FilesPane and GitDiffPane so their chord
// semantics can't drift apart.
import { matchesShortcut } from './matchers';

export type ChordResult = 'matched' | 'pending' | 'no';

export interface ChordMatcher {
  begin(event: KeyboardEvent): void;
  match(binding: string): ChordResult;
}

interface PendingChord {
  binding: string;
  index: number;
  at: number;
}

export function createChordMatcher(timeoutMs: number): ChordMatcher {
  let pending: PendingChord | null = null;
  let snapshot: PendingChord | null = null;
  let event: KeyboardEvent | null = null;

  return {
    begin(e) {
      snapshot = pending;
      pending = null;
      event = e;
    },
    match(binding) {
      if (!event) return 'no';
      const e = event;
      const steps = binding.split(' ').filter(Boolean);
      if (steps.length <= 1) return matchesShortcut(e, binding) ? 'matched' : 'no';
      const continueIdx =
        snapshot?.binding === binding && e.timeStamp - snapshot.at < timeoutMs ? snapshot.index : 0;
      // A key that breaks the pending chord may still start it over
      // (e.g. "g g g" after a stray prefix) — fall back to step 0.
      const idx = matchesShortcut(e, steps[continueIdx])
        ? continueIdx
        : matchesShortcut(e, steps[0])
          ? 0
          : -1;
      if (idx === -1) return 'no';
      if (idx === steps.length - 1) return 'matched';
      pending = { binding, index: idx + 1, at: e.timeStamp };
      return 'pending';
    },
  };
}
