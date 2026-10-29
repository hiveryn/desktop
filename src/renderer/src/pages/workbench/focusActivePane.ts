import { useSessionStore } from '../../state/sessionStore';

// Hands the keyboard back to the workspace after the sidebar had it (a
// selection or Escape): the shown pane's terminal gets DOM focus; a non-terminal
// pane just needs focus off the sidebar so the document-level dispatcher sees
// its keys. Waits a frame so a just-selected session's slot is visible.
export function focusActivePane(): void {
  requestAnimationFrame(() => {
    const { focusedPane } = useSessionStore.getState();
    const slot = document.querySelector<HTMLElement>(
      `[data-pane-slot="${CSS.escape(focusedPane)}"][data-visible="true"]`,
    );
    const textarea = slot?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea');
    if (textarea) {
      textarea.focus();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}
