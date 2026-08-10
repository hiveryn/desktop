import { Check } from '@components';
import { useEffect, useRef, useState } from 'react';
import styles from './Viewers.module.css';

const copyIcon = (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="5.5" y="5.5" width="8" height="8" />
    <path d="M10.5 5.5v-3h-8v8h3" />
  </svg>
);

interface Props {
  /** Resolved lazily on click so the freshest content (e.g. a live editor buffer) is copied. */
  getText(): string;
  label?: string;
}

/** Mode-toggle-styled button that copies text and flashes a check briefly. */
export default function CopyButton({ getText, label = 'Copy file contents' }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = (): void => {
    void navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      className={styles.modeToggleButton}
      data-active={copied || undefined}
      title={copied ? 'Copied' : label}
      aria-label={label}
      onClick={handleClick}
    >
      {copied ? <Check /> : copyIcon}
    </button>
  );
}
