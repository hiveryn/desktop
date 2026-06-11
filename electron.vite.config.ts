import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
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
      sourcemap: true,
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
    build: {
      sourcemap: true,
    },
    server: {
      fs: {
        // Allow serving source from the sibling local packages aliased below,
        // which live outside the desktop root.
        allow: [
          resolve(__dirname),
          resolve(__dirname, '../git-diff'),
          resolve(__dirname, '../shared'),
          resolve(__dirname, '../tabplugin'),
        ],
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        // Local sibling packages — alias to source so renderer edits are live
        // (HMR) instead of resolving the stale copy pnpm's hoisted linker drops
        // into node_modules. These are build-free TSX/TS modules.
        {
          find: '@hiveryn/git-diff',
          replacement: resolve(__dirname, '../git-diff/desktop/index.tsx'),
        },
        {
          find: '@hiveryn/shared/domain',
          replacement: resolve(__dirname, '../shared/domain/index.ts'),
        },
        {
          find: '@hiveryn/tabplugin',
          replacement: resolve(__dirname, '../tabplugin/index.ts'),
        },
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
