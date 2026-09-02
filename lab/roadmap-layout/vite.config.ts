import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Standalone lab harness — no daemon, no Electron. Renders the real
// production-shaped RoadmapTree/RoadmapDetail components (imported directly
// from ../../src) against hand-written fixtures, in a manually resizable
// frame, to validate the wide/narrow hierarchy-detail interaction before
// wiring RoadmapPane's fetch/SSE/keyboard layer. See git-diff/lab/live-diff
// for the sibling-repo precedent this mirrors.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // RoadmapDetail.tsx imports TicketCard through "@components" (the real
      // desktop alias, see electron.vite.config.ts). The full barrel drags in
      // every other component's runtime deps this standalone lab never
      // installed — componentsShim.ts re-exports just what's needed, from the
      // real source file.
      { find: '@components', replacement: resolve(__dirname, 'src/componentsShim.ts') },
    ],
  },
  server: {
    fs: {
      allow: [resolve(__dirname), resolve(__dirname, '../../src')],
    },
  },
});
