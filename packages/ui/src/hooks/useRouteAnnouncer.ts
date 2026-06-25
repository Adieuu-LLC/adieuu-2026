import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Announces route changes to screen readers via an aria-live region
 * and updates document.title to reflect the current page.
 */
export function useRouteAnnouncer(title: string): string {
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState('');
  const previousPathRef = useRef(pathname);

  useEffect(() => {
    const pageTitle = title || 'Page';
    document.title = `${pageTitle} — Adieuu`;

    if (pathname !== previousPathRef.current) {
      previousPathRef.current = pathname;
      setAnnouncement(pageTitle);
    }
  }, [pathname, title]);

  return announcement;
}
