import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    server: {
      fs: {
        allow: [resolve(__dirname)],
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    resolve: {
      alias: [
        {
          find: '@components',
          replacement: resolve(__dirname, 'src/renderer/src/components/index.ts'),
        },
        {
          find: '@styles',
          replacement: resolve(__dirname, 'src/renderer/src/styles'),
        },
        {
          find: '@renderer',
          replacement: resolve('src/renderer/src'),
        },
        {
          find: '@',
          replacement: resolve('src/renderer/src'),
        },
      ],
    },
  },
});
