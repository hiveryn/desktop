import { useEffect } from 'react';
import type { ShortcutConfig } from '../hooks/useShortcutConfig';
import { dispatch, setActiveShortcutConfig } from './dispatcher';

// The single document-level keydown listener for the architect window. Mounted
// once at the top level. Events that originate inside xterm's helper textarea
// are skipped — those are handled by TerminalPane's attachCustomKeyEventHandler
// instead, which runs inside xterm before any DOM-level handler sees the key.
export function useKeyDispatcher(config: ShortcutConfig | null): void {
  useEffect(() => {
    setActiveShortcutConfig(config);
  }, [config]);

  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement &&
        target.classList.contains('xterm-helper-textarea')
      ) {
        return;
      }
      if (dispatch(event) === 'consumed') {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
