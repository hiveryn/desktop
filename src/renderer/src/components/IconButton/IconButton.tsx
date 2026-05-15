import * as React from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

const IconButton: React.FC<IconButtonProps> = ({ children, className, ...rest }) => {
  const classes = [styles.root, className].filter(Boolean).join(' ');
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
};

export default IconButton;
