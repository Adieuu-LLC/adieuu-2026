import { useTranslation } from 'react-i18next';
import { DesktopAppUpdatesPanel } from '../../components/DesktopAppUpdatesPanel';

export function AboutUpdates() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('about.updates.title')}</h1>
          <p className="page-subtitle">{t('about.updates.subtitle')}</p>
        </div>

        <DesktopAppUpdatesPanel />
      </div>
    </div>
  );
}
