import type { DaemonResult, Envelope } from '../../shared/types';

export const DAEMON_URL = process.env.HIVERYN_DAEMON_URL ?? 'http://127.0.0.1:4200';

// The bound for an ordinary daemon call. Calls that legitimately take longer
// (launching a run, which for a remote worker is many SSH round trips) pass
// their own `timeoutMs` rather than raising this for every request.
export const DEFAULT_DAEMON_TIMEOUT_MS = 5000;

export interface DaemonFetchOptions {
  timeoutMs?: number;
}

function networkErrorEnvelope(message: string, code = 'NETWORK_ERROR'): Envelope {
  return {
    data: null,
    error: { code, message, details: null, stacktrace: '' },
    logs: [],
    commands: [],
    meta: { request_id: '' },
  };
}

// Always resolves — network errors and daemon error responses are both
// returned as DaemonResult so the IPC layer never throws.
// A request that outlives its bound is a TIMEOUT, distinct from an unreachable
// daemon (NETWORK_ERROR) and from the daemon's own error envelope: the daemon
// may still be working on it.
export async function daemonFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  { timeoutMs = DEFAULT_DAEMON_TIMEOUT_MS }: DaemonFetchOptions = {},
): Promise<DaemonResult<T>> {
  const { headers: extraHeaders, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${DAEMON_URL}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(extraHeaders as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      const method = init.method ?? 'GET';
      const message = `The daemon did not answer ${method} ${path} within ${timeoutMs / 1000}s`;
      return { envelope: networkErrorEnvelope(message, 'TIMEOUT') as Envelope<T>, httpStatus: 0 };
    }
    const msg = err instanceof Error ? err.message : 'Network error';
    return { envelope: networkErrorEnvelope(msg) as Envelope<T>, httpStatus: 0 };
  }

  if (res.status === 204) {
    return {
      envelope: { data: null, error: null, logs: [], commands: [], meta: { request_id: '' } },
      httpStatus: 204,
    };
  }

  const envelope = (await res
    .json()
    .catch(() => networkErrorEnvelope('Failed to parse response'))) as Envelope<T>;
  return { envelope, httpStatus: res.status };
}
