import * as React from 'react';
import styles from './ProfileSelector.module.css';

export interface AgentProfile {
  name: string;
  agent: string;
  model?: string;
  yolo?: boolean;
  mode?: string;
  args: string[];
  env: Record<string, string>;
}

interface ProfileListProps {
  profiles: AgentProfile[];
  /** Enter on the cursor, or a click. */
  onChoose: (profileName: string) => void;
  /** Escape. */
  onCancel?: () => void;
}

/**
 * The filter-and-pick profile list: the whole body of the profile selector,
 * without a backdrop or a panel of its own — the modal selector (launcher,
 * tray palette) is this list plus a portal.
 */
const ProfileList: React.FC<ProfileListProps> = ({ profiles, onChoose, onCancel }) => {
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeItemRef = React.useRef<HTMLLIElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return profiles;
    return profiles.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.agent.toLowerCase().includes(q) ||
        (p.model?.toLowerCase().includes(q) ?? false) ||
        (p.mode?.toLowerCase().includes(q) ?? false) ||
        (p.yolo === true && 'yolo'.includes(q)),
    );
  }, [profiles, query]);

  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  React.useEffect(() => {
    setActiveIndex(prev => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  React.useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const confirm = (index: number) => {
    const profile = filtered[index];
    if (profile) onChoose(profile.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        onCancel?.();
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

  return (
    <>
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
                <span className={styles.itemPrimary}>
                  <span className={styles.itemName}>{profile.name}</span>
                  {profile.mode === 'plan' && <span className={styles.itemBadge}>plan</span>}
                  {profile.yolo && <span className={styles.itemBadge}>yolo</span>}
                </span>
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
    </>
  );
};

export default ProfileList;
