import * as React from 'react';
import { createPortal } from 'react-dom';
import Button from '../Button/Button';
import styles from './Dialog.module.css';

type DialogIntent = 'default' | 'warning' | 'destructive';

interface DialogProps {
  title?: React.ReactNode;
  children?: React.ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  intent?: DialogIntent;
  // When set, the dialog portals into this element and the backdrop is
  // positioned absolutely (relative to the container) instead of covering the
  // whole viewport. Use to scope a modal to a single pane. Defaults to a
  // viewport-wide overlay on document.body.
  container?: HTMLElement | null;
}

const Dialog: React.FC<DialogProps> = ({
  title,
  children,
  onConfirm,
  onCancel,
  confirmLabel = 'OK',
  cancelLabel = 'CANCEL',
  confirmDisabled,
  intent = 'default',
  container,
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel?.();
        return;
      }

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  React.useEffect(() => {
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel?.();
    }
  };

  const intentClass = intent !== 'default' ? styles[`intent-${intent}` as keyof typeof styles] : undefined;

  const backdropClass = [styles.backdrop, container ? styles.scoped : undefined]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div className={backdropClass} onClick={handleBackdropClick}>
      <div className={[styles.panel, intentClass].filter(Boolean).join(' ')} ref={dialogRef} role="dialog" aria-modal="true">
        {title && <div className={styles.titleBar}>{title}</div>}
        <div className={styles.body}>{children}</div>
        <div className={styles.footer}>
          {onCancel && (
            <Button theme="SECONDARY" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          {onConfirm && (
            <Button onClick={onConfirm} isDisabled={confirmDisabled}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    container ?? document.body,
  );
};

export default Dialog;
