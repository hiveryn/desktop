import * as React from 'react';
import styles from './Card.module.css';

type CardAccent = 'default' | 'success' | 'warning' | 'error' | 'info';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  accent?: CardAccent;
  children?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ title, accent = 'default', children, className, ...rest }) => {
  const accentClass = accent !== 'default' ? styles[`accent-${accent}` as keyof typeof styles] : undefined;
  const classes = [styles.root, accentClass, className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      {title && <div className={styles.titleBar}>{title}</div>}
      <div className={styles.body}>{children}</div>
    </div>
  );
};

export default Card;
