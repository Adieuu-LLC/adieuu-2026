import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Tabs, TabList, TabTrigger, TabContent } from '../components/Tabs';

export function PublicHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === 'learn') {
        void navigate('/about/learn');
      }
    },
    [navigate],
  );

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('home.title')}</h1>
          <p className="page-subtitle">{t('home.public.subtitle')}</p>
        </div>

        <Tabs value="about" onValueChange={handleTabChange} className="home-tabs">
          <TabList>
            <TabTrigger value="about">{t('home.public.tabs.about')}</TabTrigger>
            <TabTrigger value="learn">{t('home.public.tabs.learn')}</TabTrigger>
          </TabList>
          <TabContent value="about">
            <Card variant="elevated" className="slide-up">
              <h2 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
                {t('home.public.whatIsTitle')}
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                {t('home.public.whatIsText1')}
              </p>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                {t('home.public.whatIsText2')}
              </p>

              <h2 style={{ color: 'var(--color-text-primary)' }}>
                {t('home.public.securityTitle')}
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                {t('home.public.securityText')}
              </p>
            </Card>

            <Card variant="elevated" className="slide-up" style={{ marginTop: 'var(--spacing-lg)', textAlign: 'center' }}>
              <h3 style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
                {t('home.public.ctaTitle')}
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 'var(--spacing-md)' }}>
                {t('home.public.ctaText')}
              </p>
              <Link to="/auth/login">
                <Button variant="primary">{t('home.public.ctaAction')}</Button>
              </Link>
            </Card>
          </TabContent>
        </Tabs>
      </div>
    </div>
  );
}
