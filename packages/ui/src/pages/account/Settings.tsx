import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';

export function AccountSettings() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('account.settings.title')}</h1>
          <p className="page-subtitle">{t('account.settings.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up">
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('account.settings.comingSoon')}
          </p>
        </Card>
      </div>
    </div>
  );
}
