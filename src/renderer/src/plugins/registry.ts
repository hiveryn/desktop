import { GitDiffTab } from '@hiveryn/git-diff';
import type { Response } from '@hiveryn/tabplugin';
import type { ComponentType } from 'react';
// Imported from concrete modules, NOT the @components barrel: this module
// reads the icon/content bindings at eval time (tabRegistry.set below), and
// it can be evaluated while the barrel is still mid-initialization
// (barrel → TerminalPane → keys/dispatcher → this file). Barrel imports here
// would hit the temporal dead zone ("Cannot access 'Kanban' before
// initialization").
import EventLog from '../components/EventLog/EventLog';
import { Activity, GitDiff, Kanban, Terminal } from '../components/icons';
import KanbanBoard from '../components/KanbanBoard/KanbanBoard';
import TicketWorkflow from '../pages/architect-window/components/TicketWorkflow';
import SessionTerminal from '../pages/architect-window/SessionTerminal';
import type { TabPluginComponent } from './types';

interface RegisteredTab {
  // biome-ignore lint/suspicious/noExplicitAny: icon and content components have type-specific props
  icon: ComponentType<any>;
  // biome-ignore lint/suspicious/noExplicitAny: icon and content components have type-specific props
  content: ComponentType<any>;
  isBuiltin: boolean;
}

const tabRegistry = new Map<string, RegisteredTab>();

// ── Built-in registrations ──────────────────────────────────────────────────

tabRegistry.set('kanban', {
  icon: Kanban,
  content: KanbanBoard,
  isBuiltin: true,
});

tabRegistry.set('event-log', {
  icon: Activity,
  content: EventLog,
  isBuiltin: true,
});

tabRegistry.set('ticket', {
  icon: Terminal,
  content: TicketWorkflow,
  isBuiltin: true,
});

tabRegistry.set('terminal', {
  icon: Terminal,
  content: SessionTerminal,
  isBuiltin: true,
});

tabRegistry.set('git-diff', {
  icon: GitDiff,
  content: GitDiffTab,
  isBuiltin: true,
});

// ── Public API ──────────────────────────────────────────────────────────────

export function registerTabPlugin(type: string, plugin: TabPluginComponent): void {
  if (tabRegistry.has(type)) {
    throw new Error(`tabplugin: duplicate registration for type '${type}'`);
  }
  tabRegistry.set(type, { ...plugin, isBuiltin: false });
}

export function getTabPlugin(type: string): TabPluginComponent | undefined {
  return tabRegistry.get(type);
}

export function listRegisteredTabs(): string[] {
  return Array.from(tabRegistry.keys());
}

export function isBuiltin(type: string): boolean {
  return tabRegistry.get(type)?.isBuiltin ?? false;
}

// ── Plugin IPC ──────────────────────────────────────────────────────────────

export function createPluginCall(
  sessionId: string,
  pluginType: string,
): (fn: string, args: Record<string, unknown>) => Promise<Response> {
  return (fn, args) =>
    window.hiveryn.plugins.call(sessionId, pluginType, fn, args) as Promise<Response>;
}
