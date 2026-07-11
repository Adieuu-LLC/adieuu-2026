import { useTranslation } from 'react-i18next';
import { useSiteAnnouncements } from '../hooks/useSiteAnnouncements';
import { useSidebar } from './Sidebar';
import { Button } from './Button';
import { Icon } from '../icons/Icon';

export function SidebarAnnouncementNotice() {
  const { t } = useTranslation();
  const { announcements, dismissedIds } = useSiteAnnouncements();
  const { isExpanded } = useSidebar();

  const highPriority = announcements.filter(
    (a) => a.highPriority && !dismissedIds.has(a.id),
  );

  if (highPriority.length === 0) return null;

  const label = t('siteAnnouncement.noticeButton');

  return (
    <div className="sidebar-announcement-notice-wrapper">
      <Button
        variant="ghost"
        size="sm"
        className="sidebar-announcement-notice-btn"
        aria-label={label}
      >
        <Icon name="info" />
        <span className="sidebar-announcement-notice-label">{label}</span>
        {highPriority.length > 1 && (
          <span
            className="sidebar-tab-badge"
            role="status"
            aria-label={`${highPriority.length} notices`}
          >
            {highPriority.length}
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="sidebar-announcement-notice-chevron"
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
      <div className={`sidebar-announcement-notice-popout ${!isExpanded ? 'sidebar-announcement-notice-popout-collapsed' : ''}`}>
        <div className="sidebar-announcement-notice-popout-content">
          {highPriority.map((a) => (
            <div key={a.id} className="sidebar-announcement-notice-item">
              {a.title && (
                <strong className="sidebar-announcement-notice-title">{a.title}</strong>
              )}
              <p className="sidebar-announcement-notice-message">{a.message}</p>
              {a.ctaLabel && a.ctaUrl && (
                <a
                  href={a.ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="sidebar-announcement-notice-cta"
                >
                  {a.ctaLabel}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
