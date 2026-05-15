import * as React from 'react';
import styles from './Text.module.css';

type TextTag = 'p' | 'span' | 'div' | 'li';

interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: TextTag;
  muted?: boolean;
}

const Text: React.FC<TextProps> = ({ as: Tag = 'p', muted, className, ...rest }) => {
  const classes = [styles.root, muted && styles.muted, className].filter(Boolean).join(' ');
  const AnyTag = Tag as React.ElementType;
  return <AnyTag className={classes} {...rest} />;
};

export default Text;
