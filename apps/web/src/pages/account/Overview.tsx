import { useTranslation } from 'react-i18next';
import { Card } from '@chadder/ui';
import { useAuth } from '../../hooks/useAuth';

export function AccountOverview() {
  const { t } = useTranslation();
  const { session } = useAuth();

  // Determine which identifier type is set
  const isEmail = session?.identifierType === 'email';
  const isPhone = session?.identifierType === 'phone';
  
  // Get initial for avatar
  const initial = session?.identifier?.charAt(0)?.toUpperCase() || '?';

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('account.overview.title')}</h1>
          <p className="page-subtitle">
            {t('account.overview.subtitle')}
          </p>
        </div>

        <Card variant="elevated" className="slide-up">
          <div className="account-overview">
            {/* Avatar placeholder */}
            <div className="account-avatar">
              <div className="account-avatar-placeholder">
                {initial}
              </div>
            </div>

            {/* Account details */}
            <div className="account-details">
              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.email')}</span>
                <span className={`account-detail-value ${!isEmail ? 'account-detail-muted' : ''}`}>
                  {isEmail ? session.identifier : t('common.notSet')}
                </span>
              </div>

              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.phone')}</span>
                <span className={`account-detail-value ${!isPhone ? 'account-detail-muted' : ''}`}>
                  {isPhone ? session.identifier : t('common.notSet')}
                </span>
              </div>

              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.accountStanding')}</span>
                <span className="account-detail-value account-status-good">
                  {t('account.overview.statusGood')}
                </span>
              </div>

              <div className="account-detail-row">
                <span className="account-detail-label">{t('account.overview.role')}</span>
                <span className="account-detail-value">
                  {t('account.overview.roleUser')}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
