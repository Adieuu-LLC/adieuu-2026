import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card';

function appVersion(): string {
  if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) {
    return __APP_VERSION__;
  }
  return '—';
}

export function Download() {
  const { t } = useTranslation();
  const version = appVersion();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('download.title')}</h1>
          <p className="page-subtitle">{t('download.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up download-page-card">
          <h2 className="download-page-card-title">{t('download.benefitsTitle')}</h2>
          <ul className="download-page-list">
            <li>{t('download.benefitNotifications')}</li>
            <li>{t('download.benefitSounds')}</li>
            <li>{t('download.benefitNative')}</li>
            <li>{t('download.benefitReliableAudio')}</li>
            <li>{t('download.benefitKeyStorage')}</li>
            <li>{t('download.benefitDedicatedWindow')}</li>
          </ul>
        </Card>

        <Card variant="elevated" className="slide-up download-page-card">
          <h2 className="download-page-card-title">{t('download.limitationsTitle')}</h2>
          <ul className="download-page-list">
            <li>{t('download.limitationTab')}</li>
            <li>{t('download.limitationAutoplay')}</li>
            <li>{t('download.limitationIndexedDb')}</li>
            <li>{t('download.limitationNoTray')}</li>
          </ul>
        </Card>

        <Card variant="elevated" className="slide-up download-page-card">
          <h2 className="download-page-card-title">{t('download.linksTitle')}</h2>
          <p className="download-page-placeholder">{t('download.linksPlaceholder')}</p>
          <p className="download-page-version">{t('download.versionLabel', { version })}</p>
        </Card>
      </div>
    </div>
  );
}
