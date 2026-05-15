import * as React from 'react';
import styles from './Label.module.css';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  as?: 'label' | 'span' | 'div';
}

const Label: React.FC<LabelProps> = ({ as: Tag = 'label', className, ...rest }) => {
  const classes = [styles.root, className].filter(Boolean).join(' ');
  const AnyTag = Tag as React.ElementType;
  return <AnyTag className={classes} {...rest} />;
};

export default Label;
