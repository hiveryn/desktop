import { ipcMain } from 'electron';
import type { AgentProfile, AgentProfileInput, DaemonResult } from '../../shared/types';
import { daemonFetch } from '../daemon/client';

export function registerProfilesIpc(): void {
  ipcMain.handle('profiles:list', async (): Promise<DaemonResult<AgentProfile[]>> => {
    const result = await daemonFetch<{ agent_profiles: AgentProfile[] }>('/api/agent-profiles');
    const profiles =
      (result.envelope.data as { agent_profiles: AgentProfile[] } | null)?.agent_profiles ?? null;
    return { httpStatus: result.httpStatus, envelope: { ...result.envelope, data: profiles } };
  });

  ipcMain.handle(
    'profiles:create',
    async (_event, input: AgentProfileInput): Promise<DaemonResult<AgentProfile>> => {
      return daemonFetch<AgentProfile>('/api/agent-profiles', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  );

  ipcMain.handle(
    'profiles:update',
    async (_event, id: string, input: AgentProfileInput): Promise<DaemonResult<AgentProfile>> => {
      return daemonFetch<AgentProfile>(`/api/agent-profiles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
  );

  ipcMain.handle('profiles:delete', async (_event, id: string): Promise<DaemonResult> => {
    return daemonFetch(`/api/agent-profiles/${id}`, { method: 'DELETE' });
  });
}
