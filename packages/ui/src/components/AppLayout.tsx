import type { ReactNode } from 'react';
import type { SidebarOrientation } from './Sidebar';

export interface AppLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** Sidebar position - affects layout order */
  sidebarOrientation?: SidebarOrientation;
}

/**
 * Main application layout with sidebar navigation.
 * The sidebar takes up to 25% of the viewport when expanded,
 * with the remaining space devoted to page content.
 * 
 * Supports left or right sidebar positioning via sidebarOrientation prop.
 */
export function AppLayout({ 
  sidebar, 
  children,
  sidebarOrientation = 'left',
}: AppLayoutProps) {
  const classNames = [
    'app-layout',
    `app-layout-sidebar-${sidebarOrientation}`,
  ].join(' ');

  return (
    <div className={classNames}>
      {sidebar}
      <main className="app-content">{children}</main>
    </div>
  );
}
