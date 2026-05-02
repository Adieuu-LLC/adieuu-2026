import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DesktopAppUpdatesPanel } from '../../components/DesktopAppUpdatesPanel';
import { usePlatform } from '../../hooks/usePlatform';
import { useUpdateContext } from '../../hooks/useUpdateContext';

export function AboutUpdates() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { status, applyUpdate } = useUpdateContext();

  return (
    <div className="page-content about-updates-page">
      <div className="container about-updates-container">
        <div className="page-header about-updates-header">
          <h1 className="page-title">{t('about.updates.title')}</h1>
          <p className="page-subtitle">{t('about.updates.subtitle')}</p>
        </div>

        {platform === 'web' && status === 'available' && (
          <Card variant="elevated" className="slide-up about-updates-web-card">
            <div className="about-updates-web-card__inner">
              <h2 className="about-updates-web-card__title">{t('about.updates.webAvailableTitle')}</h2>
              <p className="about-updates-web-card__hint">{t('about.updates.webAvailableHint')}</p>
              <Button type="button" className="btn btn-primary btn-sm" onClick={() => applyUpdate()}>
                {t('about.updates.webRefreshButton')}
              </Button>
            </div>
          </Card>
        )}

        <DesktopAppUpdatesPanel />
      </div>
    </div>
  );
}
