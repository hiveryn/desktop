import * as React from 'react';
import styles from './Heading.module.css';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
type HeadingSize = 'xl' | 'lg' | 'md' | 'sm';

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: HeadingTag;
  size?: HeadingSize;
}

const sizeStyles: Record<HeadingSize, string> = {
  xl: styles.xl,
  lg: styles.lg,
  md: styles.md,
  sm: styles.sm,
};

const Heading: React.FC<HeadingProps> = ({ as: Tag = 'h2', size = 'md', className, ...rest }) => {
  const classes = [styles.root, sizeStyles[size], className].filter(Boolean).join(' ');
  const AnyTag = Tag as React.ElementType;
  return <AnyTag className={classes} {...rest} />;
};

export default Heading;
