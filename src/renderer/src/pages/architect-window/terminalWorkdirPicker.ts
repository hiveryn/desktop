import type { CreateTerminalParams, TerminalWorkdir } from '@hiveryn/shared/domain';
import { useSessionStore } from '../../state/sessionStore';

export interface TerminalCreationRequest {
  sessionId: string;
  placement: CreateTerminalParams['placement'];
  baseTabId?: string;
  capturedActiveRightTab: string;
  capturedFocusedPane: string;
}
export const TERMINAL_WORKDIR_REQUEST = 'hiveryn:terminal-workdir-request';
export function requestTerminalCreation(request: TerminalCreationRequest): void {
  window.dispatchEvent(
    new CustomEvent<TerminalCreationRequest>(TERMINAL_WORKDIR_REQUEST, { detail: request }),
  );
}
export async function createSelectedTerminal(
  request: TerminalCreationRequest,
  choice: TerminalWorkdir,
): Promise<void> {
  const before = getState();
  if (
    before.activeSessionId !== request.sessionId ||
    before.activeRightTab !== request.capturedActiveRightTab ||
    before.focusedPane !== request.capturedFocusedPane
  )
    return;
  if (request.placement === 'split' && !request.baseTabId)
    throw new Error('Split terminal request is missing its captured base tab');
  const body: CreateTerminalParams =
    request.placement === 'split'
      ? { placement: 'split', base_tab_id: request.baseTabId as string, workdir_id: choice.id }
      : { placement: 'tab', workdir_id: choice.id };
  const created = await window.hiveryn.terminals.create(request.sessionId, body);
  const tabs = await window.hiveryn.tabs.list(request.sessionId);
  const after = getState();
  after.setSessionTabs(request.sessionId, tabs);
  if (after.activeSessionId === request.sessionId) {
    after.setActiveRightTab(created.terminal_id);
    after.setFocusedPane(`right-terminal:${created.terminal_id}`);
  }
}
function getState() {
  return useSessionStore.getState();
}
