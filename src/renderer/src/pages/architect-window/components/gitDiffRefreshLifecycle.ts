export interface DiffContextToken {
  contextKey: string;
  generation: number;
  requestSequence: number;
}

interface SequencedEvent {
  seq: number;
}

// Owns the non-visual lifetime rules for the long-lived Git diff pane.
export class GitDiffRefreshLifecycle {
  private contextKey: string | null = null;
  private generation = 0;
  private requestSequence = 0;
  private readonly lastSeenSeqBySession = new Map<string, number>();
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private inFlight: DiffContextToken | null = null;
  private rerunRequested = false;

  activate(contextKey: string | null): void {
    if (this.contextKey === contextKey) return;
    this.contextKey = contextKey;
    this.generation += 1;
  }

  beginRequest(contextKey: string): DiffContextToken {
    this.requestSequence += 1;
    return {
      contextKey,
      generation: this.generation,
      requestSequence: this.requestSequence,
    };
  }

  // One diff request per context at a time: a remote diff is several SSH round
  // trips, and stacking refreshes only multiplies them. While a request this
  // context still owns is in flight, another is recorded as wanted (null is
  // returned) and runs once after it, so no change is missed.
  tryBeginRequest(contextKey: string): DiffContextToken | null {
    if (this.inFlight && this.owns(this.inFlight)) {
      this.rerunRequested = true;
      return null;
    }
    this.rerunRequested = false;
    this.inFlight = this.beginRequest(contextKey);
    return this.inFlight;
  }

  // Ends a request; true when a refresh was asked for meanwhile and the
  // request's context is still current. A superseded request reports false.
  finishRequest(token: DiffContextToken): boolean {
    if (this.inFlight !== token) return false;
    this.inFlight = null;
    const rerun = this.rerunRequested && this.owns(token);
    this.rerunRequested = false;
    return rerun;
  }

  owns(token: DiffContextToken): boolean {
    return (
      token.contextKey === this.contextKey &&
      token.generation === this.generation &&
      token.requestSequence === this.requestSequence
    );
  }

  takeUnseen<T extends SequencedEvent>(sessionId: string, events: readonly T[]): T[] {
    const lastSeen = this.lastSeenSeqBySession.get(sessionId) ?? -1;
    const unseen = events.filter((event) => event.seq > lastSeen);
    if (unseen.length > 0) {
      this.lastSeenSeqBySession.set(
        sessionId,
        unseen.reduce((highest, event) => Math.max(highest, event.seq), lastSeen),
      );
    }
    return unseen;
  }

  schedule(contextKey: string, delay: number, callback: () => void): void {
    this.cancelScheduled();
    const generation = this.generation;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      if (this.contextKey === contextKey && this.generation === generation) callback();
    }, delay);
  }

  cancelScheduled(): void {
    if (this.debounce !== null) clearTimeout(this.debounce);
    this.debounce = null;
  }
}
