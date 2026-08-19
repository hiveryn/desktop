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
