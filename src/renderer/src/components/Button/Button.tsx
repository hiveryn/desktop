import * as React from 'react';
import styles from './Button.module.css';

type ButtonIntent = 'default' | 'success' | 'destructive' | 'warning';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  theme?: 'PRIMARY' | 'SECONDARY';
  intent?: ButtonIntent;
  isDisabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  theme = 'PRIMARY',
  intent = 'default',
  isDisabled,
  children,
  className,
  ...rest
}) => {
  const variantClass =
    intent !== 'default'
      ? styles[`intent-${intent}` as keyof typeof styles]
      : theme === 'SECONDARY'
        ? styles.secondary
        : styles.primary;
  const classes = [styles.root, variantClass, isDisabled ? styles.disabled : undefined, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={isDisabled} aria-disabled={isDisabled} {...rest}>
      {children}
    </button>
  );
};

export default Button;
