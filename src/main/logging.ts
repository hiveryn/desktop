import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type {
  RendererLogPayload,
  StructuredLogEntry,
  StructuredLogError,
  StructuredLogLevel,
} from '../shared/types';

type ConsoleMethodName = 'debug' | 'error' | 'info' | 'log' | 'warn';
type ConsoleMethod = (...args: unknown[]) => void;
type LogTarget = 'desktop' | 'renderer';

interface SourceLocation {
  file: string;
  line: number;
  fn: string;
}

interface SinkState {
  fd: number | null;
  fileName: string;
}

const LOG_DIR = join(
  homedir(),
  '.hiveryn',
  process.env.HIVERYN_APP_MODE === 'development' ? 'logs-dev' : 'logs',
);
const CONSOLE_LEVELS: Record<ConsoleMethodName, StructuredLogLevel> = {
  debug: 'debug',
  error: 'error',
  info: 'info',
  log: 'info',
  warn: 'warn',
};

const originalConsole: Record<ConsoleMethodName, ConsoleMethod> = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
};

const sinks: Record<LogTarget, SinkState> = {
  desktop: { fd: null, fileName: 'desktop.jsonl' },
  renderer: { fd: null, fileName: 'renderer.jsonl' },
};

let loggingInstalled = false;

function reportLoggingFailure(action: string, error: unknown): void {
  originalConsole.error(
    '[desktop:logging]',
    action,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
}

function ensureLogFd(target: LogTarget): number | null {
  const sink = sinks[target];
  if (sink.fd !== null) {
    return sink.fd;
  }

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    sink.fd = openSync(join(LOG_DIR, sink.fileName), 'a');
    return sink.fd;
  } catch (error) {
    reportLoggingFailure(`failed to open ${target} log file`, error);
    sink.fd = null;
    return null;
  }
}

function closeLogFd(target: LogTarget): void {
  const sink = sinks[target];
  if (sink.fd === null) {
    return;
  }

  try {
    closeSync(sink.fd);
  } catch (error) {
    reportLoggingFailure(`failed to close ${target} log file`, error);
  } finally {
    sink.fd = null;
  }
}

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

  let filePath = resource;
  if (resource.startsWith('file://')) {
    try {
      filePath = decodeURIComponent(new URL(resource).pathname);
    } catch {
      filePath = resource;
    }
  }

  return {
    file: basename(filePath),
    line: Number.parseInt(line, 10),
    fn: fnName && fnName !== 'Object.<anonymous>' ? fnName : 'unknown',
  };
}

function captureMainLocation(skip: ConsoleMethod): SourceLocation {
  const stack = new Error();
  Error.captureStackTrace(stack, skip);

  for (const frame of stack.stack?.split('\n').slice(1) ?? []) {
    const location = parseFrameLocation(frame);
    if (location) {
      return location;
    }
  }

  return { file: 'unknown', line: 0, fn: 'unknown' };
}

function sanitizeRendererPayload(payload: RendererLogPayload): StructuredLogEntry | null {
  const { lvl } = payload;
  if (!Object.values(CONSOLE_LEVELS).includes(lvl)) {
    reportLoggingFailure('renderer sent invalid log level', lvl);
    return null;
  }

  return {
    ts: payload.ts,
    lvl,
    src: 'renderer',
    msg: payload.msg,
    file: payload.file,
    line: Number.isFinite(payload.line) ? payload.line : 0,
    fn: payload.fn,
    ...(payload.err ? { err: payload.err } : {}),
    ...(payload.ctx ? { ctx: payload.ctx } : {}),
    ...(payload.body !== undefined ? { body: payload.body } : {}),
  };
}

function writeStructuredLog(target: LogTarget, entry: StructuredLogEntry): void {
  const fd = ensureLogFd(target);
  if (fd === null) {
    return;
  }

  try {
    writeSync(fd, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    closeLogFd(target);
    reportLoggingFailure(`failed to write ${target} log entry`, error);
  }
}

function createDesktopLogEntry(
  level: StructuredLogLevel,
  location: SourceLocation,
  args: unknown[],
): StructuredLogEntry {
  const err = extractStructuredError(level, args);
  const body = buildBody(args);

  return {
    ts: new Date().toISOString(),
    lvl: level,
    src: 'desktop',
    msg: buildMessage(args),
    file: location.file,
    line: location.line,
    fn: location.fn,
    ...(err ? { err } : {}),
    ...(body !== undefined ? { body } : {}),
  };
}

function createPatchedConsoleMethod(method: ConsoleMethodName): ConsoleMethod {
  const original = originalConsole[method];
  const level = CONSOLE_LEVELS[method];

  function patchedConsoleMethod(...args: unknown[]): void {
    const location = captureMainLocation(patchedConsoleMethod);
    writeStructuredLog('desktop', createDesktopLogEntry(level, location, args));
    original(...args);
  }

  return patchedConsoleMethod;
}

export function initializeDesktopLogging(): void {
  if (loggingInstalled) {
    return;
  }

  ensureLogFd('desktop');
  ensureLogFd('renderer');
  console.debug = createPatchedConsoleMethod('debug');
  console.error = createPatchedConsoleMethod('error');
  console.info = createPatchedConsoleMethod('info');
  console.log = createPatchedConsoleMethod('log');
  console.warn = createPatchedConsoleMethod('warn');
  loggingInstalled = true;
}

export function shutdownDesktopLogging(): void {
  console.debug = originalConsole.debug;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  closeLogFd('desktop');
  closeLogFd('renderer');
  loggingInstalled = false;
}

export function writeRendererLog(payload: RendererLogPayload): void {
  const entry = sanitizeRendererPayload(payload);
  if (!entry) {
    return;
  }

  writeStructuredLog('renderer', entry);
}
