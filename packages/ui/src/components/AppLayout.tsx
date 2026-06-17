import { useState, useCallback, useEffect, cloneElement, isValidElement, type ReactNode } from 'react';
import type { SidebarOrientation } from './Sidebar';
import { SiteFooter } from './SiteFooter';
import { AppNavigationChrome } from '../navigation';

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
 * - Fixed sidebar with 20vw width (max 300px)
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
      <AppNavigationChrome />
      {sidebarWithCallback}
      <main className="app-content">
        <div className="app-content-inner">
          {children}
          <SiteFooter />
        </div>
      </main>
    </div>
  );
}
