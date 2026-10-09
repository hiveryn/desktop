import { useEffect, useState } from 'react';

/**
 * Whole seconds since `startedAt` (epoch ms), ticking once a second while
 * `startedAt` is set; `null` when it is not. An honest "still working" signal
 * for operations with no measurable progress.
 */
export function useElapsedSeconds(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? null : Math.max(0, Math.floor((now - startedAt) / 1000));
}
