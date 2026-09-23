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
  footerLeft?: React.ReactNode;
  // Render the cancel button. Off, the dialog still dismisses through Escape
  // and a backdrop click — `onCancel` keeps meaning "dismiss".
  showCancelButton?: boolean;
  // Keep unmodified keystrokes inside the dialog, so the document-level app
  // dispatcher never runs a pane shortcut (kanban `o`/`s`, …) — or swallows
  // the Enter that activates a focused button — behind the modal. Modifier
  // combos still reach the global shortcuts.
  isolateKeys?: boolean;
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
  footerLeft,
  showCancelButton = true,
  isolateKeys = false,
  container,
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  // Handlers live in a ref so the focus-trap effect can run once on mount.
  // Depending on `onCancel` re-ran the effect (parents pass a fresh closure
  // every render), which re-focused the first field on each keystroke.
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  const isolateKeysRef = React.useRef(isolateKeys);
  isolateKeysRef.current = isolateKeys;

  React.useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    const getFocusable = () =>
      el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );

    // Initial focus — once, on mount.
    getFocusable()[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Stopped here rather than in the React handler: dismissing unmounts
        // the dialog before React's delegated listener would see the event.
        if (isolateKeysRef.current) e.stopPropagation();
        onCancelRef.current?.();
        return;
      }

      if (e.key === 'Tab') {
        // Re-query on each Tab: the dialog's focusable children can change
        // after mount (e.g. buttons enabling once the form is valid).
        const focusable = getFocusable();
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
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
  }, []);

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

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (isolateKeys && !e.metaKey && !e.ctrlKey && !e.altKey) e.stopPropagation();
  };

  const intentClass = intent !== 'default' ? styles[`intent-${intent}` as keyof typeof styles] : undefined;

  const backdropClass = [styles.backdrop, container ? styles.scoped : undefined]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div className={backdropClass} onClick={handleBackdropClick}>
      <div className={[styles.panel, intentClass].filter(Boolean).join(' ')} ref={dialogRef} role="dialog" aria-modal="true" onKeyDown={handlePanelKeyDown}>
        {title && <div className={styles.titleBar}>{title}</div>}
        <div className={styles.body}>{children}</div>
        <div className={styles.footer}>
          {footerLeft && <div style={{ marginRight: 'auto' }}>{footerLeft}</div>}
          {onCancel && showCancelButton && (
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
