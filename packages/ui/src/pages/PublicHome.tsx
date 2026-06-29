import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export function PublicHome() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">
            {t('home.title')}
            <span className="beta-badge">{t('home.public.betaBadge')}</span>
          </h1>
          <p className="page-subtitle">{t('home.public.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up">
          <h2 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
            {t('home.public.statusTitle')}
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            {t('home.public.statusText')}
          </p>
        </Card>

        <div className="home-beta-grid">
          <Card variant="elevated" className="slide-up">
            <h2 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
              {t('home.public.availableTitle')}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              {t('home.public.availableText')}
            </p>
          </Card>

          <Card variant="elevated" className="slide-up">
            <h2 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
              {t('home.public.comingTitle')}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              {t('home.public.comingText')}
            </p>
          </Card>
        </div>

        <Card variant="elevated" className="slide-up" style={{ marginTop: 'var(--spacing-lg)', textAlign: 'center' }}>
          <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
            {t('home.public.ctaTitle')}
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 'var(--spacing-md)' }}>
            {t('home.public.ctaText')}
          </p>
          <Link to="/auth/login" className="btn btn-primary btn-md">
            {t('home.public.ctaAction')}
          </Link>
        </Card>
      </div>
    </div>
  );
}
