import * as React from 'react';
import styles from './BottomBar.module.css';

interface BottomBarProps extends React.HTMLAttributes<HTMLDivElement> {
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

const BottomBar: React.FC<BottomBarProps> = ({ left, right, children, className, ...rest }) => {
  const classes = [styles.root, className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      <div className={styles.slot}>{left}</div>
      <div className={styles.slot}>{children}</div>
      <div className={styles.slot}>{right}</div>
    </div>
  );
};

export default BottomBar;
