import * as React from 'react';
import { useEffect, useState } from 'react';
import type { SystemRuntime } from '../../../../shared/types';
import styles from './DevBadge.module.css';

const DevBadge: React.FC = () => {
  const [runtime, setRuntime] = useState<SystemRuntime | null>(null);
  const [daemonUrl, setDaemonUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    void Promise.all([window.hiveryn.system.getRuntime(), window.hiveryn.app.getDaemonUrl()])
      .then(([nextRuntime, nextDaemonUrl]) => {
        setRuntime(nextRuntime);
        setDaemonUrl(nextDaemonUrl);
        setError(null);
      })
      .catch((err: unknown) => {
        setRuntime(null);
        setError(err);
      });
  }, []);

  if (error) {
    return (
      <span
        className={styles.badgeError}
        title={error instanceof Error ? error.message : String(error)}
      >
        RUNTIME ERROR
      </span>
    );
  }

  if (runtime === null) return null;

  const isDev = runtime.environment !== 'production';
  const label = `${runtime.environment} · ${daemonUrl ?? (runtime.base_url || `:${runtime.port}`)}`;
  const title = [
    `environment: ${runtime.environment}`,
    `connected_url: ${daemonUrl ?? ''}`,
    `base_url: ${runtime.base_url}`,
    `bind_address: ${runtime.bind_address}`,
    `port: ${runtime.port}`,
    `home: ${runtime.home}`,
    `config_path: ${runtime.config_path}`,
    `db_path: ${runtime.db_path}`,
    `log_dir: ${runtime.log_dir}`,
  ].join('\n');

  return (
    <span className={isDev ? styles.badge : styles.badgeProd} title={title}>
      {label}
    </span>
  );
};

export default DevBadge;
