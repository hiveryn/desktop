import { registerArchitectIpc } from './architect';
import { registerPreferencesIpc } from './preferences';
import { registerProfilesIpc } from './profiles';
import { registerSessionsIpc } from './sessions';
import { registerTicketsIpc } from './tickets';

export function registerIpc(): void {
  registerPreferencesIpc();
  registerProfilesIpc();
  registerArchitectIpc();
  registerSessionsIpc();
  registerTicketsIpc();
}
