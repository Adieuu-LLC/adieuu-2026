import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { RoadmapTimeline, type RoadmapTimelineNav } from '../../components/roadmap/RoadmapTimeline';
import { Icon } from '../../icons/Icon';
import { useAuth } from '../../hooks/useAuth';

export function AboutRoadmap() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const isStaff = session?.isPlatformAdmin === true || session?.isPlatformModerator === true;
  const [nav, setNav] = useState<RoadmapTimelineNav | null>(null);

  const handleNavReady = useCallback((next: RoadmapTimelineNav) => {
    setNav(next);
  }, []);

  return (
    <div className="page-content roadmap-page">
      <div className="container">
        <div className="page-header roadmap-page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">{t('about.roadmap.title')}</h1>
              <p className="page-subtitle">{t('about.roadmap.subtitle')}</p>
            </div>
            <div className="roadmap-header-controls">
              <div className="roadmap-header-nav">
                <button
                  type="button"
                  className="roadmap-timeline-arrow"
                  onClick={() => nav?.navigateUp()}
                  disabled={!nav?.canNavigateUp}
                  aria-label={t('about.roadmap.navigateUp')}
                >
                  <Icon name="chevronUp" />
                </button>
                <button
                  type="button"
                  className="roadmap-timeline-arrow"
                  onClick={() => nav?.navigateDown()}
                  disabled={!nav?.canNavigateDown}
                  aria-label={t('about.roadmap.navigateDown')}
                >
                  <Icon name="chevronDown" />
                </button>
                <button
                  type="button"
                  className="roadmap-header-today-btn"
                  onClick={() => nav?.jumpToLatest()}
                >
                  {t('about.roadmap.latestRelease')}
                </button>
              </div>
              {isStaff && (
                <Link to="/feedback/new?returnTo=/about/roadmap">
                  <Button variant="primary" size="sm">{t('feedback.newPost')}</Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        <RoadmapTimeline onNavReady={handleNavReady} />
      </div>
    </div>
  );
}
