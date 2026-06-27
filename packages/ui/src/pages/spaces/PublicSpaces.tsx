import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';

export function PublicSpaces() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('spaces.title')}</h1>
          <p className="page-subtitle">{t('spaces.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up">
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, textAlign: 'center', padding: 'var(--spacing-lg) 0' }}>
            {t('spaces.comingSoon')}
          </p>
        </Card>
      </div>
    </div>
  );
}
