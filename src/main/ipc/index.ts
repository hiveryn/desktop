import { registerAppIpc } from './app';
import { registerArchitectsIpc } from './architects';
import { registerConfigIpc } from './config';
import { registerDaemonIpc } from './daemon';
import { registerLogsIpc } from './logs';
import { registerPreferencesIpc } from './preferences';
import { registerProfilesIpc } from './profiles';
import { registerReposIpc } from './repos';
import { registerSessionIpc } from './session';
import { registerSessionsIpc } from './sessions';
import { registerSystemIpc } from './system';
import { registerTabsIpc } from './tabs';
import { registerTerminalsIpc } from './terminals';
import { registerTicketsIpc } from './tickets';
import { registerWorkbenchIpc } from './workbench';
import { registerWorkflowsIpc } from './workflows';

export function registerIpc(): void {
  registerAppIpc();
  registerPreferencesIpc();
  registerProfilesIpc();
  registerConfigIpc();
  registerDaemonIpc();
  registerLogsIpc();
  registerArchitectsIpc();
  registerSessionsIpc();
  registerSessionIpc();
  registerTabsIpc();
  registerTerminalsIpc();
  registerTicketsIpc();
  registerSystemIpc();
  registerReposIpc();
  registerWorkbenchIpc();
  registerWorkflowsIpc();
}
