import * as React from 'react';
import { useEffect, useState } from 'react';
import styles from './DevBadge.module.css';

const DevBadge: React.FC = () => {
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    void window.hiveryn.app.getMode().then((mode) => {
      setIsDev(mode === 'development');
    });
  }, []);

  if (!isDev) return null;

  return <span className={styles.badge}>DEV</span>;
};

export default DevBadge;
