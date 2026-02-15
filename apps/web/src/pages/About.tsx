import { useTranslation } from 'react-i18next';
import { Card } from '@chadder/ui';

export function About() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('about.title')}</h1>
          <p className="page-subtitle">
            {t('about.subtitle')}
          </p>
        </div>

        <Card variant="elevated" className="slide-up">
          <h2 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
            {t('about.missionTitle')}
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            {t('about.missionText1')}
          </p>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            {t('about.missionText2')}
          </p>

          <h2 style={{ color: 'var(--color-text-primary)' }}>
            {t('about.securityTitle')}
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            {t('about.securityText')}
          </p>
        </Card>
      </div>
    </div>
  );
}
