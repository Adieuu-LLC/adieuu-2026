import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../components/Tooltip';
import { RoadmapTimeline, type RoadmapTimelineNav } from '../../components/roadmap/RoadmapTimeline';
import { Icon } from '../../icons/Icon';

export function AboutRoadmap() {
  const { t } = useTranslation();
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
                <Tooltip content={t('about.roadmap.navigateUp')} position="bottom">
                  <button
                    type="button"
                    className="roadmap-nav-btn roadmap-nav-btn--icon"
                    onClick={() => nav?.navigateUp()}
                    disabled={!nav?.canNavigateUp}
                    aria-label={t('about.roadmap.navigateUp')}
                  >
                    <Icon name="chevronUp" />
                  </button>
                </Tooltip>
                <Tooltip content={t('about.roadmap.navigateDown')} position="bottom">
                  <button
                    type="button"
                    className="roadmap-nav-btn roadmap-nav-btn--icon"
                    onClick={() => nav?.navigateDown()}
                    disabled={!nav?.canNavigateDown}
                    aria-label={t('about.roadmap.navigateDown')}
                  >
                    <Icon name="chevronDown" />
                  </button>
                </Tooltip>
                <Tooltip content={t('about.roadmap.jumpToLatest')} position="bottom">
                  <button
                    type="button"
                    className="roadmap-nav-btn roadmap-nav-btn--latest"
                    onClick={() => nav?.jumpToLatest()}
                  >
                    {t('about.roadmap.latestRelease')}
                  </button>
                </Tooltip>
              </div>
              <Link to="/feedback" className="roadmap-browse-proposals-link" data-tour="roadmap-browse-proposals">
                {t('about.roadmap.browseProposals')}
              </Link>
              <Link
                to="/feedback/new?returnTo=/about/roadmap"
                className="btn btn-primary btn-sm"
              >
                {t('about.roadmap.proposeFeature')}
              </Link>
            </div>
          </div>
        </div>

        <RoadmapTimeline onNavReady={handleNavReady} />
      </div>
    </div>
  );
}
