import { registerAppIpc } from './app';
import { registerArchitectIpc } from './architect';
import { registerArchitectsIpc } from './architects';
import { registerConfigIpc } from './config';
import { registerDaemonIpc } from './daemon';
import { registerLauncherIpc } from './launcher';
import { registerLogsIpc } from './logs';
import { registerPaletteIpc } from './palette';
import { registerPluginsIpc } from './plugins';
import { registerPreferencesIpc } from './preferences';
import { registerProfilesIpc } from './profiles';
import { registerSessionIpc } from './session';
import { registerSessionsIpc } from './sessions';
import { registerSystemIpc } from './system';
import { registerTabsIpc } from './tabs';
import { registerTerminalsIpc } from './terminals';
import { registerTicketsIpc } from './tickets';

interface RegisterIpcOptions {
  openArchitectWindow: Parameters<typeof registerLauncherIpc>[0]['openArchitectWindow'];
  openLauncherWindow: () => void;
}

export function registerIpc(options: RegisterIpcOptions): void {
  registerAppIpc();
  registerPreferencesIpc();
  registerProfilesIpc();
  registerConfigIpc();
  registerDaemonIpc();
  registerLogsIpc();
  registerArchitectIpc({ openLauncherWindow: options.openLauncherWindow });
  registerArchitectsIpc();
  registerLauncherIpc(options);
  registerPaletteIpc({ openArchitectWindow: options.openArchitectWindow });
  registerSessionsIpc();
  registerSessionIpc();
  registerTabsIpc();
  registerTerminalsIpc();
  registerTicketsIpc();
  registerSystemIpc();
  registerPluginsIpc();
}
