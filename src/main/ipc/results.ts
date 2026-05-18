import type { DaemonResult } from '../../shared/types';

export function ok<T>(data: T): DaemonResult<T> {
  return {
    httpStatus: 200,
    envelope: { data, error: null, logs: [], commands: [], meta: { request_id: '' } },
  };
}

export function errorResult<T>(code: string, message: string, httpStatus = 500): DaemonResult<T> {
  return {
    httpStatus,
    envelope: {
      data: null,
      error: { code, message, details: null, stacktrace: '' },
      logs: [],
      commands: [],
      meta: { request_id: '' },
    },
  };
}

export function invalidDaemonResponse<T>(message: string): DaemonResult<T> {
  return errorResult('INVALID_DAEMON_RESPONSE', message);
}

export function withNullData<T>(result: DaemonResult<unknown>): DaemonResult<T> {
  return {
    httpStatus: result.httpStatus,
    envelope: { ...result.envelope, data: null },
  };
}

export function withData<TInput, TOutput>(
  result: DaemonResult<TInput>,
  data: TOutput | null,
): DaemonResult<TOutput> {
  return {
    httpStatus: result.httpStatus,
    envelope: { ...result.envelope, data },
  };
}
