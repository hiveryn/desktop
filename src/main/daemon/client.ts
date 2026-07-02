import type { DaemonResult, Envelope } from '../../shared/types';

export const DAEMON_URL = process.env.HIVERYN_DAEMON_URL ?? 'http://127.0.0.1:4200';

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

export interface RawFileData {
  bytes: Uint8Array;
  contentType: string;
  size: number;
  truncated: boolean;
}

// Raw-bytes variant of daemonFetch for endpoints that return a body instead of
// a JSON envelope on success (/api/fs/file) but still envelope their errors.
// Same never-throws contract as daemonFetch.
export async function daemonFetchRaw(path: string): Promise<DaemonResult<RawFileData>> {
  let res: Response;
  try {
    res = await fetch(`${DAEMON_URL}${path}`, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { envelope: networkErrorEnvelope(msg) as Envelope<RawFileData>, httpStatus: 0 };
  }

  if (!res.ok) {
    const envelope = (await res
      .json()
      .catch(() => networkErrorEnvelope('Failed to parse response'))) as Envelope<RawFileData>;
    return { envelope, httpStatus: res.status };
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  const sizeHeader = res.headers.get('x-file-size');
  const data: RawFileData = {
    bytes,
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    size: sizeHeader === null ? bytes.byteLength : Number(sizeHeader),
    truncated: res.headers.get('x-file-truncated') === 'true',
  };
  return {
    envelope: { data, error: null, logs: [], commands: [], meta: { request_id: '' } },
    httpStatus: res.status,
  };
}
