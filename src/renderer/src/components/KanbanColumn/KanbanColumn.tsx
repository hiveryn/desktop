import * as React from 'react';
import styles from './KanbanColumn.module.css';

type KanbanColumnAccent = 'default' | 'warning' | 'success';

interface KanbanColumnProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  count: number;
  children?: React.ReactNode;
  accent?: KanbanColumnAccent;
  focused?: boolean;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  title,
  count,
  children,
  accent = 'default',
  focused = false,
  className,
  ...rest
}) => {
  const accentClass = accent !== 'default' ? styles[`accent-${accent}` as keyof typeof styles] : undefined;
  const classes = [styles.root, accentClass, className].filter(Boolean).join(' ');
  const headerClasses = [styles.header, focused ? styles.headerFocused : undefined].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      <div className={headerClasses}>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{count}</span>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
};

export default KanbanColumn;
