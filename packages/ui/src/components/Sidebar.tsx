import { useState, createContext, useContext, useCallback, useEffect } from 'react';
import type { ReactNode, HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

// ============================================================================
// Types
// ============================================================================

export type SidebarOrientation = 'left' | 'right';

// ============================================================================
// Sidebar Context for managing expand/collapse state
// ============================================================================

interface SidebarContextValue {
  isExpanded: boolean;
  isMobileOpen: boolean;
  orientation: SidebarOrientation;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  setMobileOpen: (open: boolean) => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

// ============================================================================
// Sidebar Components
// ============================================================================

export interface SidebarProps {
  children: ReactNode;
  header?: ReactNode;
  /** Content rendered between the header and the scrollable nav area (not clipped by overflow) */
  topNav?: ReactNode;
  footer?: ReactNode;
  /** Optional panel rendered inside the aside but outside the scrollable nav area */
  panel?: ReactNode;
  defaultExpanded?: boolean;
  /** Sidebar position - left or right side of the screen */
  orientation?: SidebarOrientation;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
}

export function Sidebar({ 
  children, 
  header, 
  topNav,
  footer, 
  panel,
  defaultExpanded = true,
  orientation = 'left',
  onExpandedChange,
}: SidebarProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpandedState] = useState(defaultExpanded);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const setIsExpanded = useCallback((expanded: boolean) => {
    setIsExpandedState(expanded);
    onExpandedChange?.(expanded);
  }, [onExpandedChange]);

  // Notify parent of initial state on mount
  useEffect(() => {
    onExpandedChange?.(isExpanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded, setIsExpanded]);

  const setExpanded = useCallback((expanded: boolean) => {
    setIsExpanded(expanded);
  }, [setIsExpanded]);

  const setMobileOpen = useCallback((open: boolean) => {
    setIsMobileOpen(open);
  }, []);

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 600) {
        setIsMobileOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle escape key to close mobile sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen]);

  // Determine chevron direction based on orientation and expanded state
  const getChevronPath = () => {
    if (orientation === 'left') {
      return isExpanded ? "M10 12L6 8L10 4" : "M6 4L10 8L6 12";
    } else {
      // Right sidebar: chevrons are reversed
      return isExpanded ? "M6 4L10 8L6 12" : "M10 12L6 8L10 4";
    }
  };

  const classNames = [
    'sidebar',
    isExpanded ? 'sidebar-expanded' : 'sidebar-collapsed',
    `sidebar-${orientation}`,
    isMobileOpen ? 'sidebar-mobile-open' : '',
  ].filter(Boolean).join(' ');

  const toggleLabel = isExpanded 
    ? t('nav.collapseSidebar') 
    : t('nav.expandSidebar');

  const contextValue: SidebarContextValue = {
    isExpanded,
    isMobileOpen,
    orientation,
    toggleExpanded,
    setExpanded,
    setMobileOpen,
    closeMobile,
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      {/* Mobile overlay */}
      <div 
        className={`sidebar-mobile-overlay ${isMobileOpen ? 'visible' : ''}`}
        onClick={closeMobile}
        aria-hidden="true"
      />
      
      {/* Hamburger menu button for mobile */}
      <button
        className="sidebar-hamburger"
        onClick={() => setMobileOpen(!isMobileOpen)}
        aria-label={isMobileOpen ? t('nav.collapseSidebar') : t('nav.expandSidebar')}
        aria-expanded={isMobileOpen}
      >
        {isMobileOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <aside className={classNames}>
        {header && <div className="sidebar-header">{header}</div>}

        {topNav && <div className="sidebar-top-nav">{topNav}</div>}
        
        <nav className="sidebar-nav">{children}</nav>
        
        {footer && <div className="sidebar-footer">{footer}</div>}

        {panel}
        
        <button
          className="sidebar-toggle"
          onClick={toggleExpanded}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="sidebar-toggle-icon"
          >
            <path
              d={getChevronPath()}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </aside>
    </SidebarContext.Provider>
  );
}

// ============================================================================
// Navigation Item
// ============================================================================

export interface SidebarItemProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
  children?: ReactNode;
}

export function SidebarItem({ icon, label, href, onClick, isActive, children, ...props }: SidebarItemProps) {
  const { isExpanded } = useSidebar();
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = Boolean(children);

  const handleClick = () => {
    if (hasChildren) {
      setIsOpen(prev => !prev);
    } else if (onClick) {
      onClick();
    }
  };

  const content = (
    <>
      <span className="sidebar-item-icon">{icon}</span>
      <span className="sidebar-item-label">{label}</span>
      {hasChildren && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`sidebar-item-chevron ${isOpen ? 'sidebar-item-chevron-open' : ''}`}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  );

  const itemClasses = `sidebar-item ${isActive ? 'sidebar-item-active' : ''} ${hasChildren ? 'sidebar-item-expandable' : ''}`;

  // If it's a link, render as anchor (consumer will wrap with router Link)
  if (href && !hasChildren) {
    return (
      <a
        href={href}
        className={itemClasses}
        title={!isExpanded ? label : undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <div className="sidebar-item-wrapper" {...props}>
      <button
        className={itemClasses}
        onClick={handleClick}
        title={!isExpanded ? label : undefined}
        type="button"
      >
        {content}
      </button>
      {hasChildren && isOpen && isExpanded && (
        <div className="sidebar-submenu">{children}</div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-item for nested navigation
// ============================================================================

export interface SidebarSubItemProps {
  label: string;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export function SidebarSubItem({ label, href, onClick, isActive }: SidebarSubItemProps) {
  const classes = `sidebar-subitem ${isActive ? 'sidebar-subitem-active' : ''}`;

  if (href) {
    return (
      <a href={href} className={classes}>
        {label}
      </a>
    );
  }

  return (
    <button className={classes} onClick={onClick} type="button">
      {label}
    </button>
  );
}

// ============================================================================
// Divider for visual separation
// ============================================================================

export function SidebarDivider() {
  return <div className="sidebar-divider" />;
}

// ============================================================================
// Section label for grouping items
// ============================================================================

export interface SidebarSectionProps {
  label?: string;
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  const { isExpanded } = useSidebar();
  
  return (
    <div className="sidebar-section">
      {label && isExpanded && <span className="sidebar-section-label">{label}</span>}
      {children}
    </div>
  );
}
