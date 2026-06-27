import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 600;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;

/**
 * Reactive hook that tracks whether the viewport is at or below the mobile
 * breakpoint (600px), matching $mobile-breakpoint in _variables.scss.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
