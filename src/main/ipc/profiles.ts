import { ipcMain } from 'electron';
import type { AgentProfile, DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerProfilesIpc(): void {
  ipcMain.handle('profiles:list', async (): Promise<DaemonResult<AgentProfile[]>> => {
    const result = await daemonFetch<{ agent_profiles: AgentProfile[] }>('/api/agent-profiles');
    const profiles =
      (result.envelope.data as { agent_profiles: AgentProfile[] } | null)?.agent_profiles ?? null;
    return { httpStatus: result.httpStatus, envelope: { ...result.envelope, data: profiles } };
  });
}
