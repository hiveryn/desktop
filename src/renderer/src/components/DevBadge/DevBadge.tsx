import * as React from 'react';
import { useEffect, useState } from 'react';
import type { AppMode } from '../../../../shared/types';
import styles from './DevBadge.module.css';

const DevBadge: React.FC = () => {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [port, setPort] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      window.hiveryn.app.getMode(),
      window.hiveryn.app.getDaemonUrl(),
    ]).then(([m, url]) => {
      setMode(m);
      try {
        setPort(new URL(url).port || null);
      } catch {
        setPort(null);
      }
    });
  }, []);

  if (mode === null) return null;

  const isDev = mode === 'development';
  const label = isDev ? `DEV · :${port ?? '?'}` : `:${port ?? '?'}`;

  return <span className={isDev ? styles.badge : styles.badgeProd}>{label}</span>;
};

export default DevBadge;
