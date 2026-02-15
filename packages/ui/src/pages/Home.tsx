import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { usePlatform } from '../hooks/usePlatform';
import { useTourContext } from '../hooks/useTourContext';
import { useAppConfig } from '../config';

export function Home() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const tour = useTourContext();
  const { platform: platformType } = useAppConfig();

  // Use platform-specific feature key for the second card
  const secondFeatureKey = platformType === 'desktop'
    ? 'home.features.nativeDesktop'
    : 'home.features.crossPlatform';

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('home.title')}</h1>
          <p className="page-subtitle">
            {t('home.subtitle', { platform })}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => tour.start()}
            style={{ marginTop: 'var(--spacing-md)' }}
          >
            {t('home.startTour', { defaultValue: 'Take a Tour' })}
          </Button>
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
              {t(`${secondFeatureKey}.title`)}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              {t(`${secondFeatureKey}.description`)}
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
