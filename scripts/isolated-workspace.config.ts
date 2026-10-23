import { resolve } from 'node:path';
import { defineConfig, type UserConfig } from 'electron-vite';
import original from '../electron.vite.config';

const base = original as UserConfig;
export default defineConfig({
  ...base,
  main: {
    ...base.main,
    build: {
      ...base.main?.build,
      rollupOptions: {
        input: { index: resolve(__dirname, 'isolated-workspace-main.ts') },
      },
    },
  },
});
