import { registerArchitectIpc } from './architect';
import { registerArchitectsIpc } from './architects';
import { registerConfigIpc } from './config';
import { registerLauncherIpc } from './launcher';
import { registerLogsIpc } from './logs';
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
  registerPreferencesIpc();
  registerProfilesIpc();
  registerConfigIpc();
  registerLogsIpc();
  registerArchitectIpc({ openLauncherWindow: options.openLauncherWindow });
  registerArchitectsIpc();
  registerLauncherIpc(options);
  registerSessionsIpc();
  registerSessionIpc();
  registerTabsIpc();
  registerTerminalsIpc();
  registerTicketsIpc();
  registerSystemIpc();
}
