import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';

export function AccountAppearance() {
  const { t } = useTranslation();

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('account.appearance.title')}</h1>
          <p className="page-subtitle">
            {t('account.appearance.subtitle')}
          </p>
        </div>

        <Card variant="elevated" className="slide-up">
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
            {t('account.appearance.comingSoon')}
          </p>
        </Card>
      </div>
    </div>
  );
}
