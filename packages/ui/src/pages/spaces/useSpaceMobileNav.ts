/**
 * Mobile Space channel drawer state (≤720px).
 * Closes on Escape, desktop resize, and when the app sidebar opens.
 */

import { useCallback, useEffect, useState } from 'react';
import { useOptionalSidebar } from '../../components/Sidebar';

export const SPACE_MOBILE_BREAKPOINT = 720;
const QUERY = `(max-width: ${SPACE_MOBILE_BREAKPOINT}px)`;

export function useSpaceMobileNav() {
  const appSidebar = useOptionalSidebar();
  const appSidebarOpen = appSidebar?.isMobileOpen ?? false;
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false,
  );
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const closeMobileNav = useCallback(() => {
    setIsMobileNavOpen(false);
  }, []);

  const toggleMobileNav = useCallback(() => {
    setIsMobileNavOpen((open) => !open);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => {
      setIsNarrow(e.matches);
      if (!e.matches) setIsMobileNavOpen(false);
    };
    mql.addEventListener('change', handler);
    setIsNarrow(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (appSidebarOpen) setIsMobileNavOpen(false);
  }, [appSidebarOpen]);

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileNavOpen]);

  return {
    isNarrow,
    isMobileNavOpen,
    closeMobileNav,
    toggleMobileNav,
    setMobileNavOpen: setIsMobileNavOpen,
  };
}
