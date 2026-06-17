import { useTranslation } from 'react-i18next';

export function RoadmapTodayMarker() {
  const { t } = useTranslation();

  return (
    <div className="roadmap-today-marker" data-roadmap-today>
      <span className="roadmap-timeline-marker roadmap-timeline-marker--today" aria-hidden />
      <div className="roadmap-today-marker-content">
        <div className="roadmap-today-marker-label">
          {t('about.roadmap.today')}
        </div>
      </div>
    </div>
  );
}

export function RoadmapTimelineFooter() {
  const { t } = useTranslation();

  return (
    <div className="roadmap-timeline-footer">
      <p className="roadmap-timeline-footer-title">{t('about.roadmap.footerTitle')}</p>
      <p className="roadmap-timeline-footer-text">{t('about.roadmap.footerText')}</p>
      <a href="/feedback" className="roadmap-timeline-footer-link">
        {t('about.roadmap.footerCta')}
      </a>
    </div>
  );
}
