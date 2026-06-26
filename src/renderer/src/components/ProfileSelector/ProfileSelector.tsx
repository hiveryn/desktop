import * as React from 'react';
import { createPortal } from 'react-dom';
import styles from './ProfileSelector.module.css';

export interface AgentProfile {
  name: string;
  agent: string;
  model?: string;
  args: string[];
  env: Record<string, string>;
}

interface ProfileSelectorProps {
  profiles: AgentProfile[];
  open: boolean;
  onClose: () => void;
  onSelect: (profileName: string) => void;
}

const ProfileSelector: React.FC<ProfileSelectorProps> = ({ profiles, open, onClose, onSelect }) => {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeItemRef = React.useRef<HTMLLIElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return profiles;
    return profiles.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.agent.toLowerCase().includes(q) ||
        (p.model?.toLowerCase().includes(q) ?? false),
    );
  }, [profiles, query]);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  React.useEffect(() => {
    setActiveIndex(prev => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  React.useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const confirm = (index: number) => {
    const profile = filtered[index];
    if (profile) {
      onSelect(profile.name);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        confirm(activeIndex);
        break;
    }
  };

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Select agent profile">
        <div className={styles.searchRow}>
          <span className={styles.prompt}>▸</span>
          <input
            ref={inputRef}
            className={styles.searchInput}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="filter profiles..."
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        {filtered.length > 0 ? (
          <ul className={styles.list} role="listbox">
            {filtered.map((profile, i) => {
              const isActive = i === activeIndex;
              return (
                <li
                  key={profile.name}
                  ref={isActive ? activeItemRef : undefined}
                  role="option"
                  aria-selected={isActive}
                  className={[styles.item, isActive ? styles.itemActive : undefined].filter(Boolean).join(' ')}
                  onClick={() => confirm(i)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className={styles.itemName}>{profile.name}</span>
                  <span className={styles.itemMeta}>
                    {profile.model && <span className={styles.itemModel}>{profile.model}</span>}
                    <span className={styles.itemAgent}>{profile.agent}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.empty}>no profiles match</div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default ProfileSelector;
