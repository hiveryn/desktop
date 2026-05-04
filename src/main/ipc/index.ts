import { registerPreferencesIpc } from './preferences';
import { registerProfilesIpc } from './profiles';

export function registerIpc(): void {
  registerPreferencesIpc();
  registerProfilesIpc();
}
