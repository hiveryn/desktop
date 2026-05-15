import * as React from 'react';
import styles from './Glyph.module.css';

interface GlyphProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

const Glyph: React.FC<GlyphProps> = ({ children, className, ...rest }) => {
  const classes = [styles.root, className].filter(Boolean).join(' ');
  return (
    <span className={classes} aria-hidden="true" {...rest}>
      {children}
    </span>
  );
};

export default Glyph;
