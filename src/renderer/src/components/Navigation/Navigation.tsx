import * as React from 'react';
import styles from './Navigation.module.css';

interface NavigationProps extends React.HTMLAttributes<HTMLElement> {
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

const Navigation: React.FC<NavigationProps> = ({ left, right, children, className, ...rest }) => {
  const classes = [styles.root, className].filter(Boolean).join(' ');

  return (
    <nav className={classes} {...rest}>
      <div className={styles.slot}>{left}</div>
      <div className={styles.slot}>{children}</div>
      <div className={styles.slot}>{right}</div>
    </nav>
  );
};

export default Navigation;
