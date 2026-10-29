import { describe, expect, it } from 'vitest';
import { BoardListingSequence } from './boardListing';

describe('BoardListingSequence', () => {
  it('applies listings that finish in order', () => {
    const seq = new BoardListingSequence();
    const first = seq.begin();
    const second = seq.begin();
    expect(seq.apply(first)).toBe(true);
    expect(seq.apply(second)).toBe(true);
  });

  it('never lets a stale listing replace a newer applied board', () => {
    const seq = new BoardListingSequence();
    const stale = seq.begin(); // e.g. the search for "pal"
    const newer = seq.begin(); // the search for "palette"
    expect(seq.apply(newer)).toBe(true);
    expect(seq.apply(stale)).toBe(false);
  });

  it('still applies an older board when nothing newer has applied yet', () => {
    const seq = new BoardListingSequence();
    const older = seq.begin();
    seq.begin();
    // The newer listing is in flight (or failed); the older board is better
    // than none and the newer one will replace it when it lands.
    expect(seq.apply(older)).toBe(true);
  });

  it('only counts the newest listing for failures and loading state', () => {
    const seq = new BoardListingSequence();
    const first = seq.begin();
    const second = seq.begin();
    expect(seq.isNewest(first)).toBe(false);
    expect(seq.isNewest(second)).toBe(true);
    expect(seq.newest).toBe(second);
  });

  it('discards pending listings when the board context changes', () => {
    const seq = new BoardListingSequence();
    const pending = seq.begin();
    seq.discardPending();
    expect(seq.apply(pending)).toBe(false);
    expect(seq.isNewest(pending)).toBe(false);
    const next = seq.begin();
    expect(seq.apply(next)).toBe(true);
  });
});
