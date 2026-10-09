/**
 * Variants are machine-scoped: `machine` names the one execution location a
 * variant may run on, and an absent machine means local only. These helpers
 * mirror the daemon's rule for display; the daemon enforces it at launch.
 */

/** Where a launch runs: `''` for local, otherwise a machines.yaml key. */
export type ExecutionMachine = string;

/** "local" or "machine <key>", as the daemon words it. */
export function machineLabel(machine: ExecutionMachine): string {
  return machine === '' ? 'local' : `machine ${machine}`;
}

/** The variants that may run on `machine`, in listed order. */
export function profilesForMachine<P extends { machine?: string }>(
  profiles: P[],
  machine: ExecutionMachine,
): P[] {
  return profiles.filter((profile) => (profile.machine ?? '') === machine);
}

/** What to tell the user when no variant may run on `machine`. */
export function noVariantMessage(machine: ExecutionMachine): string {
  return machine === ''
    ? 'No local agent variant is configured. Add a variant without machine to variants.yaml.'
    : `No agent variant is configured for ${machineLabel(machine)}. Add a variant with machine: ${machine} to variants.yaml.`;
}

/**
 * The execution machine of a ticket's writable scope, from the architect's
 * repo locations: every repo must share one machine (local is its own). An
 * unresolvable scope returns the reason instead; the daemon reports the same
 * at launch.
 */
export function scopeMachine(
  repos: { key: string; machine?: string }[],
  scope: string[],
): { machine: ExecutionMachine } | { problem: string } {
  const byKey = new Map(repos.map((repo) => [repo.key, repo.machine ?? '']));
  let machine: ExecutionMachine | null = null;
  for (const key of scope) {
    const location = byKey.get(key);
    if (location === undefined) return { problem: `repo ${key} is not configured` };
    if (machine !== null && location !== machine) {
      return {
        problem: `writable repos must use one machine: ${scope.join(', ')} span ${machineLabel(machine)} and ${machineLabel(location)}`,
      };
    }
    machine = location;
  }
  return { machine: machine ?? '' };
}
