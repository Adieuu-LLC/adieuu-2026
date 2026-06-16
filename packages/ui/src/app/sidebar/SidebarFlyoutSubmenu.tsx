import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface SidebarFlyoutSubmenuProps {
  label: string;
  isActive?: boolean;
  children: ReactNode;
  /** Mobile drawer: render as section header + indented items instead of nested hover flyout */
  variant?: 'flyout' | 'drawer';
  onNavClick?: () => void;
}

function FlyoutChevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="sidebar-account-chevron"
    >
      <path
        d="M4.5 3L7.5 6L4.5 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SidebarFlyoutSubmenu({
  label,
  isActive = false,
  children,
  variant = 'flyout',
  onNavClick,
}: SidebarFlyoutSubmenuProps) {
  const { t } = useTranslation();

  if (variant === 'drawer') {
    return (
      <div className="sidebar-flyout-drawer-submenu">
        <div className="sidebar-flyout-drawer-submenu-label">{label}</div>
        <div className="sidebar-flyout-drawer-submenu-items" onClick={onNavClick}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-flyout-submenu-wrapper">
      <div
        className={`sidebar-flyout-submenu-trigger ${isActive ? 'sidebar-flyout-item-active' : ''}`}
        role="button"
        tabIndex={0}
        aria-haspopup="true"
        aria-label={t('nav.more')}
      >
        <span className="sidebar-flyout-submenu-label">{label}</span>
        <FlyoutChevron />
      </div>
      <div className="sidebar-flyout-submenu-panel">
        <div className="sidebar-account-flyout-content">{children}</div>
      </div>
    </div>
  );
}
