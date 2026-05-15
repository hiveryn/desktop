import * as React from 'react';
import styles from './LinkButton.module.css';

const LinkButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className,
  ...rest
}) => {
  const classes = [styles.root, className].filter(Boolean).join(' ');
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
};

export default LinkButton;
