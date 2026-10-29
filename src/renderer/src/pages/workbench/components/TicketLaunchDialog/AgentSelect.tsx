import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterAgentNames } from './launchSelection';
import styles from './TicketLaunchDialog.module.css';

interface AgentSelectProps {
  /** The agent variants, by name — the only thing the dropdown shows. */
  names: string[];
  /** The committed choice, or null when there is none yet. */
  selectedName: string | null;
  onSelect: (name: string) => void;
}

/**
 * The launch dialog's agent control: a filter input that is also a dropdown.
 *
 * Focus opens the list, typing filters it, ↑/↓ move the cursor and Enter (or a
 * click) commits the variant and closes the list — without leaving the input.
 * Enter here only ever selects: it never reaches the dialog's Spawn, which the
 * keyboard gets to by tabbing past the workflow chips.
 */
export default function AgentSelect({ names, selectedName, onSelect }: AgentSelectProps) {
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const matches = useMemo(() => filterAgentNames(names, query), [names, query]);
  const active = Math.min(cursor, Math.max(0, matches.length - 1));
  const activeRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: active is the trigger — the ref moves to the new cursor row
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // Opening starts from the full list with the cursor on the committed choice,
  // so Enter straight away keeps it and ↓ starts from where the user already is.
  const openList = () => {
    setQuery('');
    setCursor(Math.max(0, names.indexOf(selectedName ?? '')));
    setOpen(true);
  };

  const choose = (index: number) => {
    const name = matches[index];
    if (name === undefined) return;
    onSelect(name);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setCursor(Math.min(active + 1, matches.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList();
        else setCursor(Math.max(active - 1, 0));
        break;
      case 'Enter':
        // Selects, never submits: a closed list makes Enter a no-op.
        e.preventDefault();
        if (open) choose(active);
        break;
    }
  };

  return (
    <div className={styles.agent}>
      <input
        ref={inputRef}
        className={styles.agentInput}
        role="combobox"
        aria-label="agent"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches.length > 0 ? optionId(active) : undefined}
        // Closed, the input shows the choice; open, it is the filter, with the
        // choice left as the placeholder so it is still visible while typing.
        value={open ? query : (selectedName ?? '')}
        placeholder={selectedName ?? 'select agent…'}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={openList}
        onMouseDown={() => {
          if (document.activeElement === inputRef.current && !open) openList();
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
      />
      <span className={styles.agentCaret} aria-hidden="true">
        {open ? '▴' : '▾'}
      </span>
      {open && (
        <div id={listId} className={styles.agentList} role="listbox" aria-label="agents">
          {matches.length === 0 ? (
            <div className={styles.agentEmpty}>no agents match</div>
          ) : (
            matches.map((name, index) => (
              // biome-ignore lint/a11y/useFocusableInteractive: options are never focused — the input owns focus and the keyboard
              // biome-ignore lint/a11y/useKeyWithClickEvents: the input's keydown handles ↑/↓/Enter for these rows
              <div
                key={name}
                id={optionId(index)}
                ref={index === active ? activeRef : undefined}
                role="option"
                aria-selected={name === selectedName}
                className={[
                  styles.agentOption,
                  index === active ? styles.agentOptionActive : undefined,
                  name === selectedName ? styles.agentOptionSelected : undefined,
                ]
                  .filter(Boolean)
                  .join(' ')}
                // Keep focus in the input: a blur would close the list before
                // the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(index)}
                // Real pointer movement only: a row that merely ends up under a
                // resting pointer must not steal the keyboard cursor.
                onMouseMove={() => setCursor(index)}
              >
                {name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
