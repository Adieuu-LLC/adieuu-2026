import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useSiteAnnouncements } from '../hooks/useSiteAnnouncements';
import { Alert } from './Alert';
import { Button } from './Button';

const STATIC_PAGE_PREFIXES = [
  '/',
  '/about',
  '/download',
  '/search',
  '/spaces',
  '/legal-policies',
  '/feedback',
  '/service-status',
  '/refer',
];

function isStaticPage(pathname: string): boolean {
  if (pathname === '/') return true;
  return STATIC_PAGE_PREFIXES.some(
    (prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

export function SiteAnnouncementBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { announcements, dismissedIds, dismiss } = useSiteAnnouncements();

  if (!isStaticPage(pathname)) return null;

  const visible = announcements.filter((a) => !dismissedIds.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="site-announcement-banners">
      {visible.map((a) => (
        <div key={a.id} className="site-announcement-banner">
          <Alert variant="info">
            <div className="site-announcement-banner-content">
              <div className="site-announcement-banner-text">
                {a.title && (
                  <strong className="site-announcement-banner-title">{a.title}</strong>
                )}
                <span>{a.message}</span>
              </div>
              <div className="site-announcement-banner-actions">
                {a.ctaLabel && a.ctaUrl && (
                  <a
                    href={a.ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="site-announcement-banner-cta btn btn-primary btn-sm"
                  >
                    {a.ctaLabel}
                  </a>
                )}
                {a.dismissable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismiss(a.id)}
                    className="site-announcement-banner-dismiss"
                    aria-label={t('siteAnnouncement.dismiss')}
                  >
                    {t('siteAnnouncement.dismiss')}
                  </Button>
                )}
              </div>
            </div>
          </Alert>
        </div>
      ))}
    </div>
  );
}
