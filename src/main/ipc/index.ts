import { registerActionsIpc } from './actions';
import { registerAppIpc } from './app';
import { registerArchitectIpc } from './architect';
import { registerArchitectsIpc } from './architects';
import { registerConfigIpc } from './config';
import { registerDaemonIpc } from './daemon';
import { registerEditorIpc } from './editor';
import { registerFsIpc } from './fs';
import { registerLauncherIpc } from './launcher';
import { registerLogsIpc } from './logs';
import { registerPaletteIpc } from './palette';
import { registerPreferencesIpc } from './preferences';
import { registerProfilesIpc } from './profiles';
import { registerReposIpc } from './repos';
import { registerSessionIpc } from './session';
import { registerSessionsIpc } from './sessions';
import { registerSystemIpc } from './system';
import { registerTabsIpc } from './tabs';
import { registerTerminalsIpc } from './terminals';
import { registerTicketsIpc } from './tickets';
import { registerTrayIpc } from './tray';
import { registerWorkflowsIpc } from './workflows';

interface RegisterIpcOptions {
  openArchitectWindow: Parameters<typeof registerLauncherIpc>[0]['openArchitectWindow'];
  openLauncherWindow: () => void;
  openActionsWindow: () => void;
  isLauncherWindow: Parameters<typeof registerLauncherIpc>[0]['isLauncherWindow'];
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
  registerFsIpc();
  registerEditorIpc();
  registerReposIpc();
  registerTrayIpc();
  registerWorkflowsIpc();
  registerActionsIpc({ openActionsWindow: options.openActionsWindow });
}
