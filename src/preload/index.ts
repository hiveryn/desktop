import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('hiveryn', {
  preferences: {
    getTheme: (): Promise<'dark' | 'light' | 'system'> =>
      ipcRenderer.invoke('preferences:getTheme'),
    setTheme: (value: 'dark' | 'light' | 'system'): Promise<void> =>
      ipcRenderer.invoke('preferences:setTheme', value),
    onThemeChange: (callback: (value: 'dark' | 'light') => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: 'dark' | 'light'): void =>
        callback(value);
      ipcRenderer.on('preferences:theme-change', listener);
      return () => ipcRenderer.removeListener('preferences:theme-change', listener);
    },
  },
  user: {
    getProfile: (): Promise<{ data: { name: string } }> => ipcRenderer.invoke('user:getProfile'),
  },
  app: {
    getPlatform: (): Promise<string> => Promise.resolve(process.platform),
  },
});
