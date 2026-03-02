import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';

export function IdentityContentSocial() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('identity.contentSocial.title')}</h1>
          <p className="page-subtitle">{t('identity.contentSocial.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up">
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('identity.contentSocial.comingSoon')}
          </p>
        </Card>
      </div>
    </div>
  );
}
