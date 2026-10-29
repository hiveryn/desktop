import { globalShortcut, Notification } from 'electron';
import { daemonFetch } from './daemon/client';
import { toggleSidebarSearch } from './workbench';

// Default OS-global binding that toggles the sidebar of the frontmost workbench
// (expanding focuses its search) and brings a background workbench forward with
// the sidebar search focused. Chosen over Cmd+Space to avoid colliding with Spotlight; the
// daemon ships the same default. Override via the `os-global.sidebar-search` key
// in ~/.hiveryn/shortcuts.yaml.
const DEFAULT_SIDEBAR_SEARCH_BINDING = 'Option+Space';

// Modifier vocabulary mirrors src/renderer/src/keys/matchers.ts, mapped to the
// names Electron's accelerator parser expects.
const MODIFIER_MAP: Record<string, string> = {
  cmd: 'Command',
  command: 'Command',
  meta: 'Command',
  super: 'Super',
  option: 'Alt',
  alt: 'Alt',
  ctrl: 'Control',
  control: 'Control',
  shift: 'Shift',
};

// Convert a config binding ("Option+Space", "Cmd+J") to an Electron accelerator.
function toAccelerator(binding: string): string {
  return binding
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const mod = MODIFIER_MAP[part.toLowerCase()];
      if (mod) return mod;
      // Final key: capitalize so "space" → "Space", "j" → "J".
      return part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1);
    })
    .join('+');
}

async function readSidebarSearchBinding(): Promise<string> {
  const result = await daemonFetch<Record<string, Record<string, string>>>('/api/config/shortcuts');
  // The daemon may not be reachable yet at startup. Falling back to the default
  // still registers a working shortcut (a clear recovery, not a silent swallow);
  // a later reload picks up the real config once the daemon is up.
  if (result.envelope.error) {
    console.error(
      '[global-shortcut] failed to read shortcuts config; using default binding:',
      result.envelope.error.message,
    );
    return DEFAULT_SIDEBAR_SEARCH_BINDING;
  }
  return result.envelope.data?.['os-global']?.['sidebar-search'] ?? DEFAULT_SIDEBAR_SEARCH_BINDING;
}

function notifyRegistrationFailed(binding: string): void {
  const body =
    `Couldn't bind "${binding}" for the sidebar toggle — it's already taken by macOS ` +
    'or another app. Set os-global.sidebar-search in ~/.hiveryn/shortcuts.yaml to a free combination.';
  console.error(`[global-shortcut] ${body}`);
  if (Notification.isSupported()) {
    new Notification({ title: 'Hiveryn: sidebar shortcut unavailable', body }).show();
  }
}

// Accelerator we currently hold a live registration for, and the one we've
// already warned the user about. Module state so repeated calls are idempotent
// and the failure notification fires at most once per distinct binding.
let currentAccelerator: string | null = null;
let failedAccelerator: string | null = null;

// Read the configured binding and (re)register the OS-global sidebar shortcut.
// Idempotent: when the desired accelerator is already registered (ours), this is
// a no-op — it does NOT unregisterAll+re-register. It only churns the
// registration when the binding actually changes, which avoids the race where
// two overlapping calls each see register() return false even though the
// accelerator is bound. Source of truth for success is isRegistered(), never the
// register() return value.
export async function loadAndRegisterGlobalShortcut(): Promise<void> {
  const binding = await readSidebarSearchBinding();
  const accelerator = toAccelerator(binding);

  // Already live and unchanged — nothing to do.
  if (accelerator === currentAccelerator && globalShortcut.isRegistered(accelerator)) {
    return;
  }

  // Binding changed (or isn't live yet): drop the old one and (re)register.
  globalShortcut.unregisterAll();
  currentAccelerator = null;

  globalShortcut.register(accelerator, () => toggleSidebarSearch());

  if (globalShortcut.isRegistered(accelerator)) {
    currentAccelerator = accelerator;
    failedAccelerator = null;
    return;
  }

  // Genuinely couldn't bind (combo owned by macOS or another app). Surface it,
  // once per binding: only the in-app sidebar-search binding is left.
  if (failedAccelerator !== accelerator) {
    failedAccelerator = accelerator;
    notifyRegistrationFailed(binding);
  }
}
