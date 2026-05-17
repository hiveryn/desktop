type ConsoleMethodName = 'debug' | 'error' | 'info' | 'log' | 'warn';

interface SourceLocation {
  file: string;
  line: number;
  fn: string;
}

interface RendererLoggingState {
  installed: boolean;
  originalConsole: Record<ConsoleMethodName, (...args: unknown[]) => void>;
}

const rendererLoggingState = (
  globalThis as typeof globalThis & {
    __HIVERYN_RENDERER_LOGGING_STATE__?: RendererLoggingState;
  }
).__HIVERYN_RENDERER_LOGGING_STATE__ ?? {
  installed: false,
  originalConsole: {
    debug: console.debug.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
  },
};

(
  globalThis as typeof globalThis & {
    __HIVERYN_RENDERER_LOGGING_STATE__?: RendererLoggingState;
  }
).__HIVERYN_RENDERER_LOGGING_STATE__ = rendererLoggingState;

const CONSOLE_LEVELS: Record<ConsoleMethodName, StructuredLogLevel> = {
  debug: 'debug',
  error: 'error',
  info: 'info',
  log: 'info',
  warn: 'warn',
};

const originalConsole = rendererLoggingState.originalConsole;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function serializeError(error: Error): StructuredLogError {
  return {
    message: error.message,
    stack: error.stack ?? error.message,
  };
}

function normalizeValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'undefined') {
    return String(value);
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (!isObjectLike(value)) {
    return String(value);
  }

  if (depth >= 5) {
    return '[MaxDepth]';
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, seen, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = normalizeValue(entry, seen, depth + 1);
  }
  return output;
}

function formatArgForMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'undefined') {
    return 'undefined';
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  try {
    return JSON.stringify(normalizeValue(value, new WeakSet<object>(), 0));
  } catch {
    return String(value);
  }
}

function buildMessage(args: unknown[]): string {
  if (args.length === 0) {
    return '';
  }

  return args.map((arg) => formatArgForMessage(arg)).join(' ');
}

function buildBody(args: unknown[]): unknown {
  const hasStructuredArg = args.some(
    (arg) => typeof arg === 'object' || typeof arg === 'function' || typeof arg === 'symbol',
  );

  if (!hasStructuredArg) {
    return undefined;
  }

  const normalized = args.map((arg) => normalizeValue(arg, new WeakSet<object>(), 0));
  return normalized.length === 1 ? normalized[0] : { args: normalized };
}

function extractStructuredError(
  level: StructuredLogLevel,
  args: unknown[],
): StructuredLogError | undefined {
  if (level !== 'error') {
    return undefined;
  }

  for (const arg of args) {
    if (arg instanceof Error) {
      return serializeError(arg);
    }
  }

  return undefined;
}

function parseFrameLocation(rawFrame: string): SourceLocation | null {
  const frame = rawFrame.trim();
  if (!frame) {
    return null;
  }

  const match = /^at\s+(?:(.*?)\s+\()?(.+):(\d+):(\d+)\)?$/.exec(frame);
  if (!match) {
    return null;
  }

  const [, fnName, resource, line] = match;
  let fileName = resource;

  try {
    fileName = new URL(resource).pathname.split('/').filter(Boolean).pop() ?? resource;
  } catch {
    fileName = resource.split('/').filter(Boolean).pop() ?? resource;
  }

  return {
    file: decodeURIComponent(fileName),
    line: Number.parseInt(line, 10),
    fn: fnName && fnName !== 'Object.<anonymous>' ? fnName : 'unknown',
  };
}

function captureRendererLocation(): SourceLocation {
  const frames = new Error().stack?.split('\n').slice(1) ?? [];
  for (const frame of frames) {
    if (
      frame.includes('captureRendererLocation') ||
      frame.includes('patchedConsoleMethod') ||
      frame.includes('/logging.ts') ||
      frame.includes('/logging.js')
    ) {
      continue;
    }

    const location = parseFrameLocation(frame);
    if (location) {
      return location;
    }
  }

  return { file: 'unknown', line: 0, fn: 'unknown' };
}

function reportForwardingFailure(error: unknown): void {
  originalConsole.error(
    '[renderer:logging] failed to forward log entry',
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
}

function createPatchedConsoleMethod(method: ConsoleMethodName): (...args: unknown[]) => void {
  const original = originalConsole[method];
  const level = CONSOLE_LEVELS[method];

  function patchedConsoleMethod(...args: unknown[]): void {
    original(...args);

    const location = captureRendererLocation();
    const err = extractStructuredError(level, args);
    const body = buildBody(args);
    const payload: RendererLogPayload = {
      ts: new Date().toISOString(),
      lvl: level,
      msg: buildMessage(args),
      file: location.file,
      line: location.line,
      fn: location.fn,
      ...(err ? { err } : {}),
      ...(body !== undefined ? { body } : {}),
    };

    try {
      window.hiveryn.logs.writeRenderer(payload);
    } catch (error) {
      reportForwardingFailure(error);
    }
  }

  return patchedConsoleMethod;
}

export function setupRendererLogging(): void {
  if (rendererLoggingState.installed) {
    return;
  }

  console.debug = createPatchedConsoleMethod('debug');
  console.error = createPatchedConsoleMethod('error');
  console.info = createPatchedConsoleMethod('info');
  console.log = createPatchedConsoleMethod('log');
  console.warn = createPatchedConsoleMethod('warn');
  rendererLoggingState.installed = true;
}
