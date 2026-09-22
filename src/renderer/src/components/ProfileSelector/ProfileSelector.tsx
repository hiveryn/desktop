import * as React from 'react';
import { createPortal } from 'react-dom';
import ProfileList from './ProfileList';
import styles from './ProfileSelector.module.css';

export type { AgentProfile } from './ProfileList';

interface ProfileSelectorProps {
  profiles: import('./ProfileList').AgentProfile[];
  open: boolean;
  onClose: () => void;
  onSelect: (profileName: string) => void;
}

/**
 * The standalone profile picker: the shared `ProfileList` in a modal of its
 * own. Picking closes it, so it stays the one-step selector the launcher and
 * the tray palette need. The ticket launch dialog hosts the same list inline
 * instead, where picking commits a choice without launching anything.
 */
const ProfileSelector: React.FC<ProfileSelectorProps> = ({ profiles, open, onClose, onSelect }) => {
  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Select agent profile">
        <ProfileList
          profiles={profiles}
          onChoose={name => { onSelect(name); onClose(); }}
          onCancel={onClose}
        />
      </div>
    </div>,
    document.body,
  );
};

export default ProfileSelector;
