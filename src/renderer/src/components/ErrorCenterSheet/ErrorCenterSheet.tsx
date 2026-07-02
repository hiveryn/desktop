import * as React from 'react';
import { createPortal } from 'react-dom';
import Button from '../Button/Button';
import { Close } from '../icons';
import Glyph from '../Glyph/Glyph';
import IconButton from '../IconButton/IconButton';
import LinkButton from '../LinkButton/LinkButton';
import { type ErrorCenterEntry, useErrorCenterStore } from '../../state/errorCenterStore';
import styles from './ErrorCenterSheet.module.css';

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
}

interface ErrorRowProps {
  entry: ErrorCenterEntry;
  onDismiss: (id: string) => void;
}

const ErrorRow: React.FC<ErrorRowProps> = ({ entry, onDismiss }) => {
  const hasDetail = Boolean(entry.stacktrace || entry.details || entry.requestId || entry.code);
  const [expanded, setExpanded] = React.useState(false);

  return (
    <li className={styles.row}>
      <div className={styles.rowHeader}>
        <span className={styles.timestamp}>{formatTimestamp(entry.timestamp)}</span>
        <span className={styles.title}>{entry.title}</span>
        {hasDetail && (
          <LinkButton
            className={styles.detailsToggle}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            Details
          </LinkButton>
        )}
        <IconButton
          className={styles.dismiss}
          onClick={() => onDismiss(entry.id)}
          aria-label="Dismiss error"
        >
          <Glyph>
            <Close />
          </Glyph>
        </IconButton>
      </div>
      <div className={styles.message}>{entry.message}</div>
      {hasDetail && expanded && (
        <div className={styles.detail}>
          {entry.requestId && (
            <div className={styles.detailField}>
              <span className={styles.detailLabel}>request_id</span> {entry.requestId}
            </div>
          )}
          {entry.code && (
            <div className={styles.detailField}>
              <span className={styles.detailLabel}>code</span> {entry.code}
            </div>
          )}
          {entry.details != null && (
            <pre className={styles.pre}>{JSON.stringify(entry.details, null, 2)}</pre>
          )}
          {entry.stacktrace && <pre className={styles.pre}>{entry.stacktrace}</pre>}
        </div>
      )}
    </li>
  );
};

const ErrorCenterSheet: React.FC = () => {
  const sheetOpen = useErrorCenterStore((s) => s.sheetOpen);
  const entries = useErrorCenterStore((s) => s.entries);
  const closeSheet = useErrorCenterStore((s) => s.closeSheet);
  const dismissError = useErrorCenterStore((s) => s.dismissError);
  const clearAll = useErrorCenterStore((s) => s.clearAll);

  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!sheetOpen) return;
    const el = panelRef.current;
    if (!el) return;

    const getFocusable = () =>
      el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );

    getFocusable()[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeSheet();
        return;
      }
      if (e.key === 'Tab') {
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
  }, [sheetOpen, closeSheet]);

  if (!sheetOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) closeSheet();
  };

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.panel} ref={panelRef} role="dialog" aria-modal="true" aria-label="Errors">
        <div className={styles.header}>
          <span>Errors</span>
          <div className={styles.headerActions}>
            <Button
              className={styles.clearAll}
              theme="SECONDARY"
              onClick={clearAll}
              isDisabled={entries.length === 0}
            >
              Clear all
            </Button>
            <IconButton onClick={closeSheet} aria-label="Close">
              <Glyph>
                <Close />
              </Glyph>
            </IconButton>
          </div>
        </div>
        {entries.length === 0 ? (
          <div className={styles.empty}>No errors</div>
        ) : (
          <ul className={styles.list}>
            {entries.map((entry) => (
              <ErrorRow key={entry.id} entry={entry} onDismiss={dismissError} />
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default ErrorCenterSheet;
