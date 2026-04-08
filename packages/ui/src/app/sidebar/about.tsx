import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';

export function AboutFlyout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isExpanded, closeMobile } = useSidebar();

  const isActive = (path: string) => location.pathname === path;
  const isSectionActive =
    location.pathname === '/about' || location.pathname.startsWith('/about/');

  const handleNavClick = () => {
    closeMobile();
  };

  return (
    <div className="sidebar-account-flyout-wrapper" data-tour="about-menu">
      <Button
        variant="ghost"
        size="sm"
        className={`sidebar-account-btn ${isSectionActive ? 'sidebar-account-btn-active' : ''}`}
      >
        <Icon name="info" />
        <span className="sidebar-account-label">{t('nav.about')}</span>
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
      </Button>
      <div className={`sidebar-account-flyout ${!isExpanded ? 'sidebar-account-flyout-collapsed' : ''}`}>
        <div className="sidebar-account-flyout-content">
          <Link
            to="/about"
            onClick={handleNavClick}
            className={`sidebar-flyout-item ${isActive('/about') ? 'sidebar-flyout-item-active' : ''}`}
          >
            {t('about.title')}
          </Link>
          <Link
            to="/about/updates"
            onClick={handleNavClick}
            className={`sidebar-flyout-item ${isActive('/about/updates') ? 'sidebar-flyout-item-active' : ''}`}
          >
            {t('about.updates.title')}
          </Link>
        </div>
      </div>
    </div>
  );
}
