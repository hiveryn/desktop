import { ipcMain } from 'electron';
import { setVisibleIntentArchitect } from '../intentNotifications';

export function registerWorkbenchIpc(): void {
  // The renderer reports the project whose intent cards it is showing, so an OS
  // toast is suppressed only while that card is actually on screen.
  ipcMain.on('workbench:intent-scope', (_event, architectKey: string | null) => {
    setVisibleIntentArchitect(
      typeof architectKey === 'string' && architectKey ? architectKey : null,
    );
  });
}
