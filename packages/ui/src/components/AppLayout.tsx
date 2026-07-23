import { useState, useCallback, useEffect, useRef, cloneElement, isValidElement, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { SidebarOrientation } from './Sidebar';
import { SiteFooter } from './SiteFooter';
import { AppNavigationChrome } from '../navigation';
import { useRouteChrome } from '../navigation/useRouteChrome';
import { useRouteAnnouncer } from '../hooks/useRouteAnnouncer';

const SCROLL_MANAGED_PREFIXES = ['/conversations'];

function useScrollToTopOnNavigate() {
  const { pathname, hash } = useLocation();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (pathname === prevPathRef.current) {
      prevPathRef.current = pathname;
      return;
    }
    prevPathRef.current = pathname;

    if (hash) return;

    if (SCROLL_MANAGED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;

    document.querySelector('.app-content')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);
}

export interface AppLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** Sidebar position - affects layout order */
  sidebarOrientation?: SidebarOrientation;
  /** Whether sidebar is collapsed by default */
  defaultSidebarCollapsed?: boolean;
}

/**
 * Main application layout with fixed sidebar navigation.
 * The sidebar is positioned fixed and the main content has padding to accommodate it.
 * 
 * Features:
 * - Fixed sidebar with user-resizable expanded width (min = condensed 64px)
 * - Main content area with corresponding padding
 * - Mobile responsive with hamburger menu (< 600px viewport)
 * - Supports left or right sidebar positioning
 */
export function AppLayout({ 
  sidebar, 
  children,
  sidebarOrientation = 'left',
  defaultSidebarCollapsed = false,
}: AppLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(defaultSidebarCollapsed);
  const routeChrome = useRouteChrome();
  const announcement = useRouteAnnouncer(routeChrome.title);
  useScrollToTopOnNavigate();

  const handleSidebarExpandedChange = useCallback((expanded: boolean) => {
    setIsSidebarCollapsed(!expanded);
  }, []);

  useEffect(() => {
    document.body.classList.add('has-app-sidebar');
    document.body.classList.toggle('sidebar-is-collapsed', isSidebarCollapsed);
    return () => {
      document.body.classList.remove('has-app-sidebar', 'sidebar-is-collapsed');
    };
  }, [isSidebarCollapsed]);

  const classNames = [
    'app-layout',
    `app-layout-sidebar-${sidebarOrientation}`,
    isSidebarCollapsed ? 'sidebar-is-collapsed' : '',
  ].filter(Boolean).join(' ');

  // Clone the sidebar element and pass the onExpandedChange prop
  const sidebarWithCallback = isValidElement(sidebar)
    ? cloneElement(sidebar, { onExpandedChange: handleSidebarExpandedChange })
    : sidebar;

  return (
    <div className={classNames}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <AppNavigationChrome />
      {sidebarWithCallback}
      <main className="app-content" id="main-content" tabIndex={-1}>
        <div className="app-content-inner">
          {children}
          <SiteFooter />
        </div>
      </main>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </div>
  );
}
