import { Activity, EventLog, Kanban, KanbanBoard, Terminal } from '@components';
import type { ComponentType } from 'react';
import TicketWorkflow from '../pages/architect-window/components/TicketWorkflow';
import SessionTerminal from '../pages/architect-window/SessionTerminal';
import type { PluginCallResult, TabPluginComponent } from './types';

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

export async function pluginCall(
  pluginName: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<PluginCallResult> {
  try {
    const result = await window.hiveryn.plugins.call(pluginName, fn, args);
    return {
      ok: true,
      data: result,
    };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
