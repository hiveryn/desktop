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
  /**
   * The committed choice, marked in the list. `null` means nothing is chosen
   * yet — distinct from the keyboard cursor, which always sits somewhere.
   */
  selectedName?: string | null;
  /** Enter on the cursor, or a click. */
  onChoose: (profileName: string) => void;
  /** Escape. Omit to let Escape bubble to an enclosing dialog. */
  onCancel?: () => void;
  autoFocus?: boolean;
}

/**
 * The filter-and-pick profile list: the whole body of the profile selector,
 * without a backdrop or a panel of its own.
 *
 * It is a separate component so the ticket launch dialog can host the same
 * experience as a section instead of reimplementing one — the modal selector
 * (launcher, tray palette) is this list plus a portal.
 */
const ProfileList: React.FC<ProfileListProps> = ({ profiles, selectedName = null, onChoose, onCancel, autoFocus = true }) => {
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

  // The cursor starts on the committed choice when there is one, so a
  // remembered profile is where the keyboard already is.
  const [activeIndex, setActiveIndex] = React.useState(() => {
    const index = profiles.findIndex(p => p.name === selectedName);
    return index === -1 ? 0 : index;
  });

  React.useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => inputRef.current?.focus());
  }, [autoFocus]);

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
            const isSelected = profile.name === selectedName;
            return (
              <li
                key={profile.name}
                ref={isActive ? activeItemRef : undefined}
                role="option"
                aria-selected={isSelected || isActive}
                className={[styles.item, isActive ? styles.itemActive : undefined, isSelected ? styles.itemSelected : undefined].filter(Boolean).join(' ')}
                onClick={() => confirm(i)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className={styles.itemPrimary}>
                  <span className={styles.itemMarker}>{isSelected ? '●' : ''}</span>
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
