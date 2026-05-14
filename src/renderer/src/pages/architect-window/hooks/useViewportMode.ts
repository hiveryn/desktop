import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT_PX = 960;

function isCompactViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
}

export function useViewportMode(): boolean {
  const [isCompact, setIsCompact] = useState<boolean>(() => isCompactViewport());

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const handleChange = (event: MediaQueryListEvent): void => {
      setIsCompact(event.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isCompact;
}
