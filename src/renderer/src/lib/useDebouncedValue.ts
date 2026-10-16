import { useEffect, useState } from 'react';

/**
 * value, settled: it follows value only once value has stopped changing for
 * delayMs. A value equal to `immediate` is applied at once, so clearing a
 * search restores the full board without waiting out the debounce.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, immediate?: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (immediate !== undefined && value === immediate) {
      setSettled(value);
      return;
    }
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs, immediate]);
  return settled;
}
