// Latest-wins bookkeeping for the board listings (load, refresh, search).
// Every listing takes a token. Its board is applied unless a newer listing's
// board already was, and its failure is reported only while it is the newest
// listing — so a request finishing late can neither replace a newer board
// (a stale search result over a newer query) nor report a failure a newer
// request has already recovered from.
export class BoardListingSequence {
  private latest = 0;
  private applied = 0;
  // Listings up to this token were discarded by discardPending().
  private discarded = 0;

  /** Starts a listing and returns its token. */
  begin(): number {
    this.latest += 1;
    return this.latest;
  }

  /** The newest listing started, or 0 before any. */
  get newest(): number {
    return this.latest;
  }

  /** Whether token is the newest listing — its failure and loading state count. */
  isNewest(token: number): boolean {
    return token > this.discarded && token === this.latest;
  }

  /**
   * Records token's board as applied, unless a newer listing's board already
   * is. Returns whether the caller should show the board.
   */
  apply(token: number): boolean {
    if (token <= this.discarded || this.applied > token) return false;
    this.applied = token;
    return true;
  }

  /**
   * Discards every listing started so far: their boards no longer apply and
   * their failures no longer count (an architect switch).
   */
  discardPending(): void {
    this.discarded = this.latest;
  }
}
