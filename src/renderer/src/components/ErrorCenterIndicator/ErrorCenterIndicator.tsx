import * as React from 'react';
import { AlertTriangle } from '../icons';
import Glyph from '../Glyph/Glyph';
import IconButton from '../IconButton/IconButton';
import { useErrorCenterStore } from '../../state/errorCenterStore';
import styles from './ErrorCenterIndicator.module.css';

const ErrorCenterIndicator: React.FC = () => {
  const unreadCount = useErrorCenterStore((s) => s.unreadCount);
  const openSheet = useErrorCenterStore((s) => s.openSheet);

  return (
    <IconButton
      className={styles.root}
      onClick={openSheet}
      aria-label={unreadCount > 0 ? `Errors (${unreadCount} unread)` : 'Errors'}
    >
      <Glyph>
        <AlertTriangle />
      </Glyph>
      {unreadCount > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </IconButton>
  );
};

export default ErrorCenterIndicator;
