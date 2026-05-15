import * as React from 'react';
import styles from './Caption.module.css';

interface CaptionProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'span' | 'p' | 'div';
}

const Caption: React.FC<CaptionProps> = ({ as: Tag = 'span', className, ...rest }) => {
  const classes = [styles.root, className].filter(Boolean).join(' ');
  const AnyTag = Tag as React.ElementType;
  return <AnyTag className={classes} {...rest} />;
};

export default Caption;
