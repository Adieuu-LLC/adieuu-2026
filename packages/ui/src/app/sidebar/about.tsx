import { useState } from 'react';
import { BottomSheet, type BottomSheetOpenChangeDetails } from '@ark-ui/react/bottom-sheet';
import { Portal } from '@ark-ui/react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../../components/Sidebar';
import { Icon } from '../../icons/Icon';
import { useAppConfig } from '../../config';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SidebarFlyoutSubmenu } from './SidebarFlyoutSubmenu';

export function RoadmapSidebarLink() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isExpanded, closeMobile } = useSidebar();
  const isActive = location.pathname === '/about/roadmap';
  const label = t('about.roadmap.title');

  return (
    <Link
      to="/about/roadmap"
      onClick={closeMobile}
      title={!isExpanded ? label : undefined}
      aria-label={label}
      data-tour="roadmap-nav"
      className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
    >
      <span className="sidebar-item-icon">
        <Icon name="clock" />
      </span>
      <span className="sidebar-item-label">{label}</span>
    </Link>
  );
}

export function AboutFlyout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { platform } = useAppConfig();
  const { isExpanded, closeMobile } = useSidebar();
  const isMobile = useIsMobile();
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  const isLegalPoliciesActive = location.pathname.startsWith('/legal-policies');
  const isSectionActive =
    location.pathname === '/about'
    || (location.pathname.startsWith('/about/') && location.pathname !== '/about/roadmap')
    || location.pathname.startsWith('/feedback')
    || isLegalPoliciesActive;

  const handleNavClick = () => {
    setDrawerOpen(false);
    closeMobile();
  };

  const moreSubmenuItems = (
    <Link
      to="/legal-policies"
      onClick={handleNavClick}
      className={`sidebar-flyout-item ${isLegalPoliciesActive ? 'sidebar-flyout-item-active' : ''}`}
    >
      {t('nav.legalPolicies')}
    </Link>
  );

  const menuItems = (
    <>
      <Link
        to="/about"
        onClick={handleNavClick}
        className={`sidebar-flyout-item ${isActive('/about') ? 'sidebar-flyout-item-active' : ''}`}
      >
        {t('about.title')}
      </Link>
      <Link
        to="/about/learn"
        onClick={handleNavClick}
        className={`sidebar-flyout-item ${isActive('/about/learn') ? 'sidebar-flyout-item-active' : ''}`}
      >
        {t('home.learn.navLabel')}
      </Link>
      <Link
        to="/feedback"
        onClick={handleNavClick}
        className={`sidebar-flyout-item ${location.pathname.startsWith('/feedback') ? 'sidebar-flyout-item-active' : ''}`}
      >
        {t('feedback.title')}
      </Link>
      {platform === 'web' ? (
        <Link
          to="/download"
          onClick={handleNavClick}
          className={`sidebar-flyout-item ${isActive('/download') ? 'sidebar-flyout-item-active' : ''}`}
        >
          {t('nav.getDesktopApp')}
        </Link>
      ) : (
        <Link
          to="/about/updates"
          onClick={handleNavClick}
          className={`sidebar-flyout-item ${isActive('/about/updates') ? 'sidebar-flyout-item-active' : ''}`}
        >
          {t('about.updates.title')}
        </Link>
      )}
      {isMobile ? (
        <SidebarFlyoutSubmenu
          label={t('nav.more')}
          isActive={isLegalPoliciesActive}
          variant="drawer"
        >
          <Link
            to="/legal-policies"
            onClick={handleNavClick}
            className={`sidebar-subitem ${isLegalPoliciesActive ? 'sidebar-subitem-active' : ''}`}
          >
            {t('nav.legalPolicies')}
          </Link>
        </SidebarFlyoutSubmenu>
      ) : (
        <SidebarFlyoutSubmenu label={t('nav.more')} isActive={isLegalPoliciesActive}>
          {moreSubmenuItems}
        </SidebarFlyoutSubmenu>
      )}
    </>
  );

  const triggerButton = (
    <button
      type="button"
      className={`sidebar-item ${isSectionActive ? 'sidebar-item-active' : ''}`}
      {...(isMobile ? { onClick: () => setDrawerOpen(true) } : {})}
    >
      <span className="sidebar-item-icon">
        <Icon name="info" />
      </span>
      <span className="sidebar-item-label">{t('nav.about')}</span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="sidebar-item-chevron"
      >
        <path
          d="M4.5 3L7.5 6L4.5 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  if (isMobile) {
    return (
      <div data-tour="about-menu">
        {triggerButton}
        <BottomSheet.Root
          open={isDrawerOpen}
          onOpenChange={(details: BottomSheetOpenChangeDetails) => setDrawerOpen(details.open)}
          lazyMount
          unmountOnExit
        >
          <Portal>
            <BottomSheet.Backdrop className="sidebar-flyout-drawer-backdrop" />
            <BottomSheet.Content className="sidebar-flyout-drawer-content">
              <BottomSheet.Grabber className="sidebar-flyout-drawer-grabber">
                <BottomSheet.GrabberIndicator className="sidebar-flyout-drawer-grabber-indicator" />
              </BottomSheet.Grabber>
              <BottomSheet.Title className="sidebar-flyout-drawer-title">
                {t('nav.about')}
              </BottomSheet.Title>
              <div className="sidebar-flyout-drawer-items">
                {menuItems}
              </div>
            </BottomSheet.Content>
          </Portal>
        </BottomSheet.Root>
      </div>
    );
  }

  return (
    <div className="sidebar-account-flyout-wrapper" data-tour="about-menu">
      {triggerButton}
      <div className={`sidebar-account-flyout sidebar-account-flyout-below ${!isExpanded ? 'sidebar-account-flyout-collapsed' : ''}`}>
        <div className="sidebar-account-flyout-content">
          {menuItems}
        </div>
      </div>
    </div>
  );
}
