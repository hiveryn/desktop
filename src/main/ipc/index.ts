import { registerArchitectIpc } from './architect';
import { registerArchitectsIpc } from './architects';
import { registerLauncherIpc } from './launcher';
import { registerPreferencesIpc } from './preferences';
import { registerProfilesIpc } from './profiles';
import { registerSessionsIpc } from './sessions';
import { registerSystemIpc } from './system';
import { registerTicketsIpc } from './tickets';

interface RegisterIpcOptions {
  openArchitectWindow: Parameters<typeof registerLauncherIpc>[0]['openArchitectWindow'];
  openLauncherWindow: () => void;
}

export function registerIpc(options: RegisterIpcOptions): void {
  registerPreferencesIpc();
  registerProfilesIpc();
  registerArchitectIpc({ openLauncherWindow: options.openLauncherWindow });
  registerArchitectsIpc();
  registerLauncherIpc(options);
  registerSessionsIpc();
  registerTicketsIpc();
  registerSystemIpc();
}
