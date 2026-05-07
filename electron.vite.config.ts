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
        allow: [resolve(__dirname), resolve(__dirname, '../components')],
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    resolve: {
      alias: [
        {
          find: '@hiveryn/components/styles/global.css',
          replacement: resolve(__dirname, '../components/src/styles/global.css'),
        },
        {
          find: /^@hiveryn\/components$/,
          replacement: resolve(__dirname, '../components/src/components/index.ts'),
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
