import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import type { LifetimeTabProps } from './types';
import { INSIDER_FEATURES, LIFETIME_EXTRA_FEATURES } from './types';

export function LifetimeTab({
  derived,
  identityMode,
  actionLoading,
  onCheckout,
}: LifetimeTabProps) {
  const { t } = useTranslation();
  const { hasVanguard, hasFounder } = derived;

  const allFeatures = [...INSIDER_FEATURES, ...LIFETIME_EXTRA_FEATURES];

  return (
    <div className="subscription-lifetime">
      <h2 className="subscription-section-heading">
        {t('account.subscription.sections.lifetime')}
      </h2>
      <p className="subscription-section-description">
        {t('account.subscription.sections.lifetimeDescription')}
      </p>
      <div className="subscription-grid">
        {/* Vanguard */}
        <Card className={`subscription-tier-card ${hasVanguard ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">
              {t('account.subscription.tiers.vanguard.name')}
            </h2>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.vanguard.description')}
          </p>
          <ul className="subscription-feature-list">
            {allFeatures.map((f) => (
              <li key={f} className="subscription-feature-item">
                <span className="subscription-feature-check" aria-hidden="true">&#10003;</span>
                {t(`account.subscription.features.${f}`)}
              </li>
            ))}
          </ul>
          {hasVanguard ? (
            <div className="subscription-tier-badge">
              {t('account.subscription.owned')}
            </div>
          ) : !hasFounder && !identityMode && (
            <Button
              onClick={() => onCheckout('vanguard')}
              disabled={actionLoading}
              variant="secondary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.buyOnce')}
            </Button>
          )}
        </Card>

        {/* Founder */}
        <Card className={`subscription-tier-card subscription-tier-featured ${hasFounder ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">
              {t('account.subscription.tiers.founder.name')}
            </h2>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.founder.description')}
          </p>
          <ul className="subscription-feature-list">
            {allFeatures.map((f) => (
              <li key={f} className="subscription-feature-item">
                <span className="subscription-feature-check" aria-hidden="true">&#10003;</span>
                {t(`account.subscription.features.${f}`)}
              </li>
            ))}
          </ul>
          {hasFounder ? (
            <div className="subscription-tier-badge">
              {t('account.subscription.owned')}
            </div>
          ) : !identityMode && (
            <Button
              onClick={() => onCheckout('founder')}
              disabled={actionLoading}
              variant="primary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.buyOnce')}
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
