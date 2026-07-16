import * as React from 'react';
import { Close, Plus } from '../icons';
import styles from './TabBar.module.css';

export interface TabBarTab {
  id: string;
  icon: React.ComponentType;
  label?: string;
  disabled?: boolean;
  // Shows an attention indicator on the tab (e.g. a pending approval).
  notify?: boolean;
  // When set, renders an action button alongside the tab (e.g. conclude).
  // The handler fires without switching the active tab.
  onAction?: () => void;
  actionLabel?: string;
  actionIcon?: React.ComponentType;
}

interface TabBarProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs: TabBarTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onAdd?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  addLabel?: string;
  side?: 'left' | 'right' | 'bottom';
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTab,
  onTabChange,
  onAdd,
  addLabel = 'Add',
  side = 'left',
  className,
  ...rest
}) => {
  const classes = [
    styles.root,
    side === 'right' ? styles.right : undefined,
    side === 'bottom' ? styles.bottom : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      role="tablist"
      aria-orientation={side === 'bottom' ? 'horizontal' : 'vertical'}
      {...rest}
    >
      {tabs.map(({ id, icon: Icon, label, disabled, notify, onAction, actionLabel, actionIcon }) => {
        const isActive = id === activeTab;
        const tabClass = [styles.tab, isActive ? styles.active : undefined]
          .filter(Boolean)
          .join(' ');
        // A nested <button> would be invalid HTML, so the action button is a
        // sibling of the selection button inside a presentation wrapper.
        const ActionIcon = actionIcon ?? Close;
        return (
          <div key={id} className={styles.tabWrap} role="presentation">
            <button
              role="tab"
              aria-selected={isActive}
              className={tabClass}
              disabled={disabled}
              title={label}
              onClick={() => onTabChange(id)}
            >
              <Icon />
              {label !== undefined && <span className={styles.tabLabel}>{label}</span>}
              {notify && <span className={styles.notifyDot} aria-label="Needs attention" />}
            </button>
            {onAction && (
              <button
                type="button"
                className={styles.tabAction}
                aria-label={actionLabel ?? 'Tab action'}
                title={actionLabel}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction();
                }}
              >
                <ActionIcon />
              </button>
            )}
          </div>
        );
      })}
      {onAdd && (
        <button className={styles.addBtn} onClick={(e) => onAdd(e)} aria-label={addLabel}>
          <Plus />
        </button>
      )}
    </div>
  );
};

export default TabBar;
