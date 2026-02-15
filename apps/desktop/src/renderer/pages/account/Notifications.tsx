import { useTranslation } from 'react-i18next';
import { Card } from '@chadder/ui';

export function AccountNotifications() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('account.notifications.title')}</h1>
          <p className="page-subtitle">
            {t('account.notifications.subtitle')}
          </p>
        </div>

        <Card variant="elevated" className="slide-up">
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            {t('account.notifications.comingSoon')}
          </p>
        </Card>
      </div>
    </div>
  );
}
