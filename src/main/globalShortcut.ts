import { globalShortcut, Notification } from 'electron';
import { daemonFetch } from './daemon/client';
import { togglePalette } from './tray';

// Default OS-global binding for the command palette. Chosen over Cmd+Space to
// avoid colliding with Spotlight. Override via the `os-global.palette` key in
// ~/.hiveryn/shortcuts.yaml.
const DEFAULT_PALETTE_BINDING = 'Option+Space';

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

async function readPaletteBinding(): Promise<string> {
  const result = await daemonFetch<Record<string, Record<string, string>>>('/api/config/shortcuts');
  // The daemon may not be reachable yet at startup. Falling back to the default
  // still registers a working shortcut (a clear recovery, not a silent swallow);
  // a later reload picks up the real config once the daemon is up.
  if (result.envelope.error) {
    console.error(
      '[global-shortcut] failed to read shortcuts config; using default binding:',
      result.envelope.error.message,
    );
    return DEFAULT_PALETTE_BINDING;
  }
  return result.envelope.data?.['os-global']?.palette ?? DEFAULT_PALETTE_BINDING;
}

function notifyRegistrationFailed(binding: string): void {
  const body =
    `Couldn't bind "${binding}" for the command palette — it's already taken by macOS ` +
    'or another app. Set os-global.palette in ~/.hiveryn/shortcuts.yaml to a free combination.';
  console.error(`[global-shortcut] ${body}`);
  if (Notification.isSupported()) {
    new Notification({ title: 'Hiveryn: palette shortcut unavailable', body }).show();
  }
}

// Read the configured binding and (re)register the OS-global palette shortcut.
// Safe to call repeatedly — it unregisters the previous binding first, so it
// doubles as the live-reload path when the user edits shortcuts.yaml.
export async function loadAndRegisterGlobalShortcut(): Promise<void> {
  globalShortcut.unregisterAll();

  const binding = await readPaletteBinding();
  const accelerator = toAccelerator(binding);

  const registered = globalShortcut.register(accelerator, () => togglePalette());
  // register() returns false / can silently fail when the combo is already
  // claimed. Surface it — there's no in-app palette fallback anymore.
  if (!registered || !globalShortcut.isRegistered(accelerator)) {
    notifyRegistrationFailed(binding);
  }
}
