import { ipcMain } from 'electron';
import type { AgentProfile, DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';
import { invalidDaemonResponse, withData, withNullData } from './results';

export function registerProfilesIpc(): void {
  ipcMain.handle('profiles:list', async (): Promise<DaemonResult<AgentProfile[]>> => {
    const result = await daemonFetch<{ agent_profiles: AgentProfile[] }>('/api/agent-profiles');
    if (result.envelope.error) {
      return withNullData(result);
    }
    if (!Array.isArray(result.envelope.data?.agent_profiles)) {
      return invalidDaemonResponse('profiles:list returned missing agent_profiles array');
    }
    return withData(result, result.envelope.data.agent_profiles);
  });
}
