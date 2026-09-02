import type { TerminalWorkdir } from '@hiveryn/shared/domain';
import * as React from 'react';
import { createPortal } from 'react-dom';
import styles from '../ProfileSelector/ProfileSelector.module.css';

interface Props { choices: TerminalWorkdir[]; open: boolean; onClose(): void; onSelect(choice: TerminalWorkdir): void; }

export default function WorkdirSelector({ choices, open, onClose, onSelect }: Props) {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeRef = React.useRef<HTMLLIElement>(null);
  const filtered = React.useMemo(() => { const q = query.trim().toLowerCase(); return q ? choices.filter(c => c.title.toLowerCase().includes(q) || c.display_path.toLowerCase().includes(q) || c.path.toLowerCase().includes(q)) : choices; }, [choices, query]);
  React.useEffect(() => { if (open) { setQuery(''); setActiveIndex(0); requestAnimationFrame(() => inputRef.current?.focus()); } }, [open]);
  React.useEffect(() => setActiveIndex(i => Math.min(i, Math.max(0, filtered.length - 1))), [filtered.length]);
  React.useEffect(() => activeRef.current?.scrollIntoView({ block: 'nearest' }), [activeIndex]);
  if (!open) return null;
  const confirm = (i: number) => { const choice = filtered[i]; if (choice) onSelect(choice); };
  return createPortal(<div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Choose terminal working directory">
      <div className={styles.searchRow}><span className={styles.prompt}>▸</span><input ref={inputRef} className={styles.searchInput} value={query} onChange={e => { setQuery(e.target.value); setActiveIndex(0); }} onKeyDown={e => {
        if (e.key === 'Escape') onClose();
        else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)); }
        else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); confirm(activeIndex); }
      }} placeholder="filter workspaces..." spellCheck={false} autoComplete="off" /></div>
      {filtered.length ? <ul className={styles.list} role="listbox">{filtered.map((choice, i) => <li key={choice.id} ref={i === activeIndex ? activeRef : undefined} role="option" aria-selected={i === activeIndex} className={[styles.item, i === activeIndex ? styles.itemActive : undefined].filter(Boolean).join(' ')} onClick={() => confirm(i)} onMouseEnter={() => setActiveIndex(i)}><span className={styles.itemName}>{choice.title}</span><span className={styles.itemMeta}><span className={styles.itemModel}>{choice.display_path}</span></span></li>)}</ul> : <div className={styles.empty}>no workspaces match</div>}
    </div>
  </div>, document.body);
}
