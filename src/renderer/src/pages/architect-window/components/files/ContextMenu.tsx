import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

export interface ContextMenuItem {
  label: string;
  action(): void;
}

interface Props {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose(): void;
}

// Minimal right-click menu: portal at the pointer, clamped to the viewport,
// dismissed by backdrop click or Escape. Items run their action then close.
export default function ContextMenu({ position, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(position);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setClamped({
      x: Math.min(position.x, window.innerWidth - rect.width - 4),
      y: Math.min(position.y, window.innerHeight - rect.height - 4),
    });
  }, [position]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase so Escape can't leak into the pane's key dispatcher.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses the menu; Escape handled above
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above
    <div className={styles.backdrop} onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={menuRef}
        className={styles.menu}
        role="menu"
        style={{ left: clamped.x, top: clamped.y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={(e) => {
              e.stopPropagation();
              item.action();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
