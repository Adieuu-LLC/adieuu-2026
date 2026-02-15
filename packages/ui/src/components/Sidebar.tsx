import { useState, createContext, useContext, useCallback } from 'react';
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
  orientation: SidebarOrientation;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
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
  footer?: ReactNode;
  defaultExpanded?: boolean;
  /** Sidebar position - left or right side of the screen */
  orientation?: SidebarOrientation;
}

export function Sidebar({ 
  children, 
  header, 
  footer, 
  defaultExpanded = true,
  orientation = 'left',
}: SidebarProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const setExpanded = useCallback((expanded: boolean) => {
    setIsExpanded(expanded);
  }, []);

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
  ].join(' ');

  const toggleLabel = isExpanded 
    ? t('nav.collapseSidebar') 
    : t('nav.expandSidebar');

  return (
    <SidebarContext.Provider value={{ isExpanded, orientation, toggleExpanded, setExpanded }}>
      <aside className={classNames}>
        {header && <div className="sidebar-header">{header}</div>}
        
        <nav className="sidebar-nav">{children}</nav>
        
        {footer && <div className="sidebar-footer">{footer}</div>}
        
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
  label: string;
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  const { isExpanded } = useSidebar();
  
  return (
    <div className="sidebar-section">
      {isExpanded && <span className="sidebar-section-label">{label}</span>}
      {children}
    </div>
  );
}
