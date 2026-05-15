import * as React from 'react';
import { useTheme } from '../ThemeProvider/ThemeProvider';
import IconButton from '../IconButton/IconButton';
import Sun from '../icons/Sun';
import Moon from '../icons/Moon';
import styles from './ThemeSwitcher.module.css';

const ThemeSwitcher: React.FC = () => {
  const { isDark, setTheme } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  const [flipAbove, setFlipAbove] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (!isOpen || !containerRef.current || !popoverRef.current) return;

    const chipRect = containerRef.current.getBoundingClientRect();
    const popoverHeight = popoverRef.current.offsetHeight;
    const spaceBelow = window.innerHeight - chipRect.bottom;
    const spaceAbove = chipRect.top;

    setFlipAbove(spaceBelow < popoverHeight + 8 && spaceAbove > spaceBelow);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (dark: boolean) => {
    setTheme(dark);
    setIsOpen(false);
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <IconButton
        onClick={() => setIsOpen((o) => !o)}
        aria-label={isDark ? 'Dark mode' : 'Light mode'}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {isDark ? <Moon /> : <Sun />}{isDark ? 'DARK' : 'LIGHT'}
      </IconButton>
      {isOpen && (
        <div
          className={[styles.popover, flipAbove ? styles.above : undefined].filter(Boolean).join(' ')}
          ref={popoverRef}
          role="listbox"
        >
          <button
            className={[styles.option, !isDark ? styles.selected : undefined].filter(Boolean).join(' ')}
            onClick={() => handleSelect(false)}
            role="option"
            aria-selected={!isDark}
          >
            ☀ LIGHT
          </button>
          <button
            className={[styles.option, isDark ? styles.selected : undefined].filter(Boolean).join(' ')}
            onClick={() => handleSelect(true)}
            role="option"
            aria-selected={isDark}
          >
            ☾ DARK
          </button>
        </div>
      )}
    </div>
  );
};

export default ThemeSwitcher;
