// Transport-agnostic terminal module. The public surface is the dependency-
// injected components plus the interfaces a host must implement. This module
// must NOT depend on window.hiveryn, the session store, the keyboard
// dispatcher, or the @components barrel — hosts wire those in via the types
// below.

export type { TerminalSessionProps } from './TerminalSession';
export { default as TerminalSession } from './TerminalSession';
export type { TerminalViewProps } from './TerminalView';
export { default as TerminalView } from './TerminalView';
export type {
  GpuCrashSource,
  RouteKey,
  TerminalThemeSource,
  TerminalTransport,
} from './types';
