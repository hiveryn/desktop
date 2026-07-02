import * as React from 'react';
import { createPortal } from 'react-dom';
import { Close } from '../icons';
import Glyph from '../Glyph/Glyph';
import IconButton from '../IconButton/IconButton';
import { useToastStore } from '../../state/toastStore';
import styles from './ToastHost.module.css';

const TOAST_DURATION_MS = 4000;

interface ToastRowProps {
  id: string;
  title: string;
  message: string;
  onDismiss: (id: string) => void;
}

const ToastRow: React.FC<ToastRowProps> = ({ id, title, message, onDismiss }) => {
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div className={styles.toast} role="alert">
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>
      </div>
      <IconButton className={styles.close} onClick={() => onDismiss(id)} aria-label="Dismiss">
        <Glyph>
          <Close />
        </Glyph>
      </IconButton>
    </div>
  );
};

const ToastHost: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className={styles.stack}>
      {toasts.map((toast) => (
        <ToastRow
          key={toast.id}
          id={toast.id}
          title={toast.title}
          message={toast.message}
          onDismiss={dismissToast}
        />
      ))}
    </div>,
    document.body,
  );
};

export default ToastHost;
