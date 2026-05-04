import type { DaemonResult, Envelope } from '../../shared/types';

const DAEMON_URL = 'http://127.0.0.1:4300';

function networkErrorEnvelope(message: string): Envelope {
  return {
    data: null,
    error: { code: 'NETWORK_ERROR', message, details: null, stacktrace: '' },
    logs: [],
    commands: [],
    meta: { request_id: '' },
  };
}

// Always resolves — network errors and daemon error responses are both
// returned as DaemonResult so the IPC layer never throws.
export async function daemonFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<DaemonResult<T>> {
  const { headers: extraHeaders, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${DAEMON_URL}${path}`, {
      signal: AbortSignal.timeout(5000),
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(extraHeaders as Record<string, string> | undefined),
      },
    });
  } catch (err) {
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
