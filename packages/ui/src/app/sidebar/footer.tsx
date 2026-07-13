import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { createApiClient } from '@adieuu/shared';
import { AccountFlyout, IdentityFlyout, isAccountSidebarHidden } from './identity';
import { SidebarUpdateNav } from './SidebarUpdateNav';
import { SidebarAnnouncementNotice } from '../../components/SidebarAnnouncementNotice';
import { useIdentity } from '../../hooks/useIdentity';
import { useSupportUnreadCount } from '../../hooks/useSupportUnreadCount';
import { SidebarCallWidget } from '../../components/call/SidebarCallWidget';
import type { SidebarVariant } from './nav';

export function ModerationFlyout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isExpanded, closeMobile } = useSidebar();
  const { session } = useAuth();
  const { apiBaseUrl } = useAppConfig();

  const showAdmin = session?.isPlatformAdmin === true;
  const isModeratorActive = location.pathname.startsWith('/moderation');
  const isAdminActive = location.pathname.startsWith('/admin');
  const isSectionActive = isModeratorActive || isAdminActive;

  const [unresolvedCount, setUnresolvedCount] = useState(0);

  useEffect(() => {
    if (!session) return;
    const api = createApiClient({ baseUrl: apiBaseUrl });
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const [mine, unassigned] = await Promise.all([
          api.moderation.listReports({ status: 'open,escalated', assigned: 'me', limit: 1 }),
          api.moderation.listReports({ status: 'open,escalated', assigned: 'unassigned', limit: 1 }),
        ]);
        if (cancelled) return;
        const total = (mine.data?.total ?? 0) + (unassigned.data?.total ?? 0);
        setUnresolvedCount(total);
      } catch { /* silent */ }
    };

    void fetchCount();
    const interval = setInterval(() => void fetchCount(), 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [session, apiBaseUrl]);

  return (
    <div className="sidebar-account-flyout-wrapper">
      <Button
        variant="ghost"
        size="sm"
        className={`sidebar-account-btn ${isSectionActive ? 'sidebar-account-btn-active' : ''}`}
      >
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <Icon name="shield" />
          {unresolvedCount > 0 && (
            <span className="sidebar-tab-badge" role="status" aria-label={`${unresolvedCount} unresolved`}>
              {unresolvedCount > 99 ? '99+' : unresolvedCount}
            </span>
          )}
        </span>
        <span className="sidebar-account-label">{t('moderation.nav.submenuLabel')}</span>
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
      </Button>
      <div className={`sidebar-account-flyout ${!isExpanded ? 'sidebar-account-flyout-collapsed' : ''}`}>
        <div className="sidebar-account-flyout-content">
          <Link
            to="/moderation"
            onClick={closeMobile}
            className={`sidebar-flyout-item ${isModeratorActive ? 'sidebar-flyout-item-active' : ''}`}
          >
            {t('moderation.nav.moderationLink')}
            {unresolvedCount > 0 && (
              <span className="sidebar-tab-badge" role="status" style={{ marginLeft: 'auto', position: 'static' }} aria-label={`${unresolvedCount} unresolved`}>
                {unresolvedCount > 99 ? '99+' : unresolvedCount}
              </span>
            )}
          </Link>
          {showAdmin && (
            <Link
              to="/admin"
              onClick={closeMobile}
              className={`sidebar-flyout-item ${isAdminActive ? 'sidebar-flyout-item-active' : ''}`}
            >
              {t('moderation.nav.adminLink')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarLoginPrompt() {
  const { t } = useTranslation();
  const { isExpanded, closeMobile } = useSidebar();
  const loginLabel = t('nav.loginPrompt');

  return (
    <div className="sidebar-login-prompt">
      <Link
        to="/auth/login"
        onClick={closeMobile}
        title={!isExpanded ? loginLabel : undefined}
        aria-label={loginLabel}
      >
        <Button variant="primary" size="sm" className="sidebar-login-btn">
          <Icon name="user" />
          <span className="sidebar-login-label">{loginLabel}</span>
        </Button>
      </Link>
    </div>
  );
}

export function SidebarFooterContent({ variant = 'full' }: { variant?: SidebarVariant }) {
  const { t } = useTranslation();
  const { platform } = useAppConfig();
  const { closeMobile } = useSidebar();
  const isDownloadActive = useLocation().pathname === '/download';
  const showDesktopAppLink = platform === 'web';
  const isPublic = variant === 'public';

  if (isPublic) {
    return (
      <div className="sidebar-footer-stack">
        {showDesktopAppLink && (
          <div className="sidebar-desktop-row">
            <Link
              to="/download"
              className={`sidebar-desktop-link${isDownloadActive ? ' sidebar-desktop-link-active' : ''}`}
              onClick={closeMobile}
            >
              <Icon name="download" />
              <span className="sidebar-desktop-label">{t('nav.getDesktopApp')}</span>
            </Link>
          </div>
        )}
        <SidebarAnnouncementNotice />
        <SidebarLoginPrompt />
      </div>
    );
  }

  return <AuthenticatedSidebarFooter />;
}

function AuthenticatedSidebarFooter() {
  const { t } = useTranslation();
  const { platform } = useAppConfig();
  const { session, status: authStatus } = useAuth();
  const { status: identityStatus } = useIdentity();
  const { closeMobile } = useSidebar();
  const showModerator =
    session?.isPlatformModerator === true ||
    session?.isPlatformAdmin === true ||
    session?.isPlatformSupportAgent === true;
  const isDownloadActive = useLocation().pathname === '/download';
  const showDesktopAppLink = platform === 'web';
  const accountSupportEnabled = !isAccountSidebarHidden(authStatus, identityStatus);
  const identitySupportEnabled = identityStatus === 'logged_in';
  const supportUnreadCount = useSupportUnreadCount(accountSupportEnabled || identitySupportEnabled);

  return (
    <div className="sidebar-footer-stack">
      <SidebarCallWidget />
      {showModerator && (
        <ModerationFlyout />
      )}
      {showDesktopAppLink && (
        <div className="sidebar-desktop-row">
          <Link
            to="/download"
            className={`sidebar-desktop-link${isDownloadActive ? ' sidebar-desktop-link-active' : ''}`}
            onClick={closeMobile}
          >
            <Icon name="download" />
            <span className="sidebar-desktop-label">{t('nav.getDesktopApp')}</span>
          </Link>
        </div>
      )}
      <SidebarUpdateNav />
      <SidebarAnnouncementNotice />
      <div className="sidebar-identity-section">
        <div className="sidebar-identity-row">
          <IdentityFlyout supportUnreadCount={identitySupportEnabled ? supportUnreadCount : 0} />
        </div>
      </div>

      <AccountFlyout supportUnreadCount={accountSupportEnabled ? supportUnreadCount : 0} />
    </div>
  );
}
