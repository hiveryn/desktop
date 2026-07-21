import { useEffect, useRef, useState } from 'react';
import styles from './RepoPicker.module.css';

export interface RepoOption {
  repoKey: string;
  isPrimary: boolean;
}

interface Props {
  options: RepoOption[];
  selectedRepoKey: string;
  onSelect(repoKey: string): void;
}

// Repository selector for the Git review pane: every repository scoped to the
// ticket, primary first and marked. Always shown (even single-repo sessions),
// mirroring the Files pane's root picker.
export default function RepoPicker({ options, selectedRepoKey, onSelect }: Props) {
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

  const active = options.find((option) => option.repoKey === selectedRepoKey);
  if (!active) {
    throw new Error(`repo picker: selected repo ${selectedRepoKey} not in options`);
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active.repoKey}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles.triggerLabel}>{active.repoKey}</span>
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={styles.menu} role="listbox" aria-label="Repository">
          {options.map((option) => (
            <button
              key={option.repoKey}
              type="button"
              role="option"
              aria-selected={option.repoKey === selectedRepoKey}
              className={styles.item}
              data-active={option.repoKey === selectedRepoKey || undefined}
              title={option.repoKey}
              onClick={() => {
                setOpen(false);
                if (option.repoKey !== selectedRepoKey) onSelect(option.repoKey);
              }}
            >
              <span className={styles.itemLabel}>{option.repoKey}</span>
              {option.isPrimary && <span className={styles.itemKind}>primary</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
