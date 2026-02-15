import { useTranslation } from 'react-i18next';
import { Card, usePlatform } from '@chadder/ui';

export function Home() {
  const { t } = useTranslation();
  const platform = usePlatform();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('home.title')}</h1>
          <p className="page-subtitle">
            {t('home.subtitle', { platform })}
          </p>
        </div>

        <div className="grid grid-2">
          <Card variant="elevated" className="slide-up">
            <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
              {t('home.features.encryption.title')}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              {t('home.features.encryption.description')}
            </p>
          </Card>

          <Card variant="elevated" className="slide-up stagger-1">
            <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
              {t('home.features.nativeDesktop.title')}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              {t('home.features.nativeDesktop.description')}
            </p>
          </Card>

          <Card variant="elevated" className="slide-up stagger-2">
            <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
              {t('home.features.passwordless.title')}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              {t('home.features.passwordless.description')}
            </p>
          </Card>

          <Card variant="elevated" className="slide-up stagger-3">
            <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
              {t('home.features.privacy.title')}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              {t('home.features.privacy.description')}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
