import * as React from 'react';
import { Close, Plus } from '../icons';
import styles from './TabBar.module.css';

export interface TabBarTab {
  id: string;
  icon: React.ComponentType;
  label?: string;
  disabled?: boolean;
  closable?: boolean;
}

interface TabBarProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs: TabBarTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onTabClose?: (tabId: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  side?: 'left' | 'right' | 'bottom';
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabChange, onTabClose, onAdd, addLabel = 'Add', side = 'left', className, ...rest }) => {
  const classes = [
    styles.root,
    side === 'right' ? styles.right : undefined,
    side === 'bottom' ? styles.bottom : undefined,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      role="tablist"
      aria-orientation={side === 'bottom' ? 'horizontal' : 'vertical'}
      {...rest}
    >
      {tabs.map(({ id, icon: Icon, label, disabled, closable }) => {
        const isActive = id === activeTab;
        const tabClass = [styles.tab, isActive ? styles.active : undefined].filter(Boolean).join(' ');
        const showClose = closable && onTabClose;
        return (
          <div key={id} className={styles.tabItem}>
            <button
              role="tab"
              aria-selected={isActive}
              className={tabClass}
              disabled={disabled}
              onClick={() => onTabChange(id)}
            >
              <Icon />
              {label !== undefined && <span className={styles.tabLabel}>{label}</span>}
            </button>
            {showClose && (
              <button
                className={styles.closeBtn}
                onClick={(e) => { e.stopPropagation(); onTabClose(id); }}
                aria-label={`Close ${label ?? id}`}
              >
                <Close />
              </button>
            )}
          </div>
        );
      })}
      {onAdd && (
        <button className={styles.addBtn} onClick={onAdd} aria-label={addLabel}>
          <Plus />
        </button>
      )}
    </div>
  );
};

export default TabBar;
