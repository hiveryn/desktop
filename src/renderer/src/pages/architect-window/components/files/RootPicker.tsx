import { useEffect, useRef, useState } from 'react';
import styles from './RootPicker.module.css';

export interface RootOption {
  id: string;
  label: string;
  path: string;
  kind: 'workspace' | 'repo' | 'custom';
}

interface Props {
  roots: RootOption[];
  activeRootId: string;
  onSelect(root: RootOption): void;
  onPickCustom(): void;
}

export default function RootPicker({ roots, activeRootId, onSelect, onPickCustom }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = roots.find((root) => root.id === activeRootId);
  if (!active) {
    throw new Error(`root picker: active root ${activeRootId} not in options`);
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active.path}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles.triggerLabel}>{active.label}</span>
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={styles.menu} role="listbox" aria-label="Explorer root">
          {roots.map((root) => (
            <button
              key={root.id}
              type="button"
              role="option"
              aria-selected={root.id === activeRootId}
              className={styles.item}
              data-active={root.id === activeRootId || undefined}
              title={root.path}
              onClick={() => {
                setOpen(false);
                if (root.id !== activeRootId) onSelect(root);
              }}
            >
              <span className={styles.itemLabel}>{root.label}</span>
              <span className={styles.itemKind}>{root.kind}</span>
            </button>
          ))}
          <button
            type="button"
            className={`${styles.item} ${styles.customItem}`}
            onClick={() => {
              setOpen(false);
              onPickCustom();
            }}
          >
            Custom path…
          </button>
        </div>
      )}
    </div>
  );
}
