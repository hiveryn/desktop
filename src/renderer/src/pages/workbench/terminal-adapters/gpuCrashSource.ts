import type { GpuCrashSource } from '../../../terminal';

// Subscribes to the Electron main process's GPU-crash signal. When the GPU
// process restarts, every WebGL context is destroyed; the terminal view
// re-attaches its renderer in response.
export const gpuCrashSource: GpuCrashSource = (cb) => window.hiveryn.app.onGpuProcessCrashed(cb);
