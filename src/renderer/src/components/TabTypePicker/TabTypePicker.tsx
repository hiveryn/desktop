import * as React from 'react';
import { createPortal } from 'react-dom';
import { Globe, Terminal } from '../icons';
import styles from './TabTypePicker.module.css';

export type TabTypeChoice = 'terminal' | 'browser';

interface TabTypeOption {
  choice: TabTypeChoice;
  label: string;
  icon: React.ComponentType;
}

const OPTIONS: TabTypeOption[] = [
  { choice: 'terminal', label: 'Terminal', icon: Terminal },
  { choice: 'browser', label: 'Browser', icon: Globe },
];

interface TabTypePickerProps {
  open: boolean;
  // Anchor rect of the "+" button; the menu is positioned relative to it.
  anchor: DOMRect | null;
  onClose: () => void;
  onSelect: (choice: TabTypeChoice) => void;
}

// A small Terminal/Browser menu on the right-pane "+" button. Modeled on
// ProfileSelector's portal + backdrop + keyboard-nav pattern, minus the filter
// (pointless for a fixed two-item menu).
const TabTypePicker: React.FC<TabTypePickerProps> = ({ open, anchor, onClose, onSelect }) => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      setActiveIndex(0);
      requestAnimationFrame(() => menuRef.current?.focus());
    }
  }, [open]);

  const confirm = (index: number): void => {
    const option = OPTIONS[index];
    if (option) {
      onSelect(option.choice);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, OPTIONS.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        confirm(activeIndex);
        break;
    }
  };

  if (!open || !anchor) return null;

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) onClose();
  };

  // Right pane tab bar sits at the far right; drop the menu just below the "+"
  // button and right-align it under the button.
  const menuStyle: React.CSSProperties = {
    top: anchor.bottom + 4,
    right: Math.max(8, window.innerWidth - anchor.right),
  };

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: transparent backdrop to catch outside clicks
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled on the menu; Esc closes
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        ref={menuRef}
        className={styles.menu}
        style={menuStyle}
        role="menu"
        aria-label="New tab type"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {OPTIONS.map((option, i) => {
          const isActive = i === activeIndex;
          const Icon = option.icon;
          return (
            <button
              key={option.choice}
              type="button"
              role="menuitem"
              className={[styles.item, isActive ? styles.itemActive : undefined]
                .filter(Boolean)
                .join(' ')}
              onClick={() => confirm(i)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className={styles.itemIcon}>
                <Icon />
              </span>
              <span className={styles.itemLabel}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};

export default TabTypePicker;
