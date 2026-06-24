import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface SidebarFlyoutSubmenuProps {
  label: string;
  isActive?: boolean;
  children: ReactNode;
  /** Mobile drawer: render as section header + indented items instead of nested hover flyout */
  variant?: 'flyout' | 'drawer';
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
      aria-hidden="true"
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
}: SidebarFlyoutSubmenuProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const focusFirstPanelItem = useCallback(() => {
    const panel = wrapperRef.current?.querySelector('.sidebar-flyout-submenu-panel');
    const firstFocusable = panel?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
  }, []);

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        focusFirstPanelItem();
      }
    },
    [focusFirstPanelItem],
  );

  if (variant === 'drawer') {
    return (
      <div className="sidebar-flyout-drawer-submenu">
        <div className="sidebar-flyout-drawer-submenu-label">{label}</div>
        {/* Drawer nav items handle their own onClick (e.g. close drawer on navigate). */}
        <div className="sidebar-flyout-drawer-submenu-items">{children}</div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="sidebar-flyout-submenu-wrapper">
      <button
        type="button"
        className={`sidebar-flyout-submenu-trigger ${isActive ? 'sidebar-flyout-item-active' : ''}`}
        aria-haspopup="true"
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="sidebar-flyout-submenu-label">{label}</span>
        <FlyoutChevron />
      </button>
      <div className="sidebar-flyout-submenu-panel">
        <div className="sidebar-account-flyout-content">{children}</div>
      </div>
    </div>
  );
}
