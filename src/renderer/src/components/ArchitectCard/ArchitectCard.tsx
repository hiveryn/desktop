import * as React from 'react';
import styles from './ArchitectCard.module.css';

export interface ArchitectCardData {
  key: string;
  name?: string;
  path: string;
  repos?: Array<{ key: string }>;
}

interface ArchitectCardProps {
  architect: ArchitectCardData;
  onOpen: (key: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  status?: 'running' | 'offline';
}

function getRepoSummary(data: ArchitectCardData): string {
  if (data.repos && data.repos.length > 0) {
    return data.repos.map(r => r.key).join(' · ');
  }
  return '(no repos)';
}

const ArchitectCard: React.FC<ArchitectCardProps> = ({
  architect,
  onOpen,
  disabled,
  isLoading,
  status,
}) => {
  const isInert = disabled;

  const handleActivate = () => {
    if (!isInert) onOpen(architect.key);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleActivate();
    }
  };

  const rootClasses = [
    styles.root,
    disabled ? styles.disabled : undefined,
    isLoading ? styles.loading : undefined,
  ].filter(Boolean).join(' ');

  if (isLoading) {
    return (
      <div className={rootClasses} aria-busy="true" aria-label="Loading architect">
        <div className={styles.titleBar}>
          <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
        </div>
        <div className={styles.body}>
          <div className={`${styles.skeletonLine} ${styles.skeletonPath}`} />
          <div className={styles.meta}>
            <div className={`${styles.skeletonLine} ${styles.skeletonRepos}`} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={rootClasses}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      aria-disabled={isInert || undefined}
    >
      <div className={styles.titleBar}>
        <span className={styles.title}>{architect.name ?? architect.key.toUpperCase()}</span>
        {status === 'running' && (
          <div className={styles.titleActions}>
            <span className={styles.statusTag}>running</span>
          </div>
        )}
      </div>
      <div className={styles.body}>
        <div className={styles.path} title={architect.path}>
          {architect.path}
        </div>
        <div className={styles.meta}>
          <span className={styles.repos}>{getRepoSummary(architect)}</span>
        </div>
      </div>
    </div>
  );
};

export default ArchitectCard;
