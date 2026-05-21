import { homedir } from 'node:os';
import { join } from 'node:path';

export const DESKTOP_ENVIRONMENT =
  process.env.HIVERYN_ENV?.trim() ||
  (process.env.HIVERYN_APP_MODE === 'development' ? 'development' : 'production');

export const DESKTOP_RUNTIME_HOME = process.env.HIVERYN_HOME?.trim() || join(homedir(), '.hiveryn');

export const IS_DESKTOP_DEVELOPMENT = DESKTOP_ENVIRONMENT !== 'production';
