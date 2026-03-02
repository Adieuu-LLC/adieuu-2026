import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';

export function IdentityProfile() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('identity.profile.title')}</h1>
          <p className="page-subtitle">{t('identity.profile.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up">
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('identity.profile.comingSoon')}
          </p>
        </Card>
      </div>
    </div>
  );
}
