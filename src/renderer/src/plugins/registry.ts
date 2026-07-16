// Imported from concrete modules, NOT the @components barrel: this module
// reads the icon bindings at eval time (tabRegistry.set below), and it can be
// evaluated while the barrel is still mid-initialization (barrel →
// TerminalPane → keys/dispatcher → this file). Barrel imports here would hit
// the temporal dead zone ("Cannot access 'Kanban' before initialization").
import { Activity, Folder, GitDiff, Globe, Kanban, Terminal } from '../components/icons';
import type { TabPluginComponent } from './types';

const tabRegistry = new Map<string, TabPluginComponent>();

// ── Built-in registrations ──────────────────────────────────────────────────

tabRegistry.set('kanban', { icon: Kanban });
tabRegistry.set('event-log', { icon: Activity });
tabRegistry.set('ticket', { icon: Terminal });
tabRegistry.set('terminal', { icon: Terminal });
tabRegistry.set('git-diff', { icon: GitDiff });
tabRegistry.set('files', { icon: Folder });
tabRegistry.set('browser', { icon: Globe });

// ── Public API ──────────────────────────────────────────────────────────────

export function getTabPlugin(type: string): TabPluginComponent | undefined {
  return tabRegistry.get(type);
}
