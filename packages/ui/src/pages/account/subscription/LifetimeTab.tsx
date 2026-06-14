import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import type { LifetimeTabProps } from './types';
import { COMPARISON_FEATURE_ORDER, type ComparisonColumnId } from './types';
import {
  getSubscriptionFeatureCell,
  parseSubscriptionFeatureVariables,
} from './subscription-feature-cells';

function LifetimeFeatureList({ columnId }: { columnId: ComparisonColumnId }) {
  const { t } = useTranslation();
  const featureVariables = useMemo(
    () =>
      parseSubscriptionFeatureVariables(
        t('account.subscription.featureVariables', { returnObjects: true }),
      ),
    [t],
  );

  return (
    <ul className="subscription-feature-list">
      {COMPARISON_FEATURE_ORDER.map((featureKey) => {
        const cell = getSubscriptionFeatureCell(featureKey, columnId, featureVariables);
        const label = t(`account.subscription.features.${featureKey}`);
        if (cell.kind === 'variable') {
          return (
            <li key={featureKey} className="subscription-feature-item">
              <span className="subscription-feature-check" aria-hidden="true">
                &#10003;
              </span>
              <span aria-label={`${label}: ${cell.displayValue}`}>
                {label}{' '}
                <span className="subscription-feature-value">{cell.displayValue}</span>
              </span>
            </li>
          );
        }
        if (cell.included) {
          return (
            <li key={featureKey} className="subscription-feature-item">
              <span className="subscription-feature-check" aria-hidden="true">
                &#10003;
              </span>
              <span>{label}</span>
            </li>
          );
        }
        return (
          <li key={featureKey} className="subscription-feature-item subscription-feature-item--excluded">
            <span className="subscription-feature-excluded" aria-hidden="true">
              &#10005;
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function LifetimeTab({
  derived,
  identityMode,
  actionLoading,
  onCheckout,
}: LifetimeTabProps) {
  const { t } = useTranslation();
  const { hasVanguard, hasFounder } = derived;

  return (
    <div className="subscription-lifetime">
      <h2 className="subscription-section-heading">
        {t('account.subscription.sections.lifetime')}
      </h2>
      <p className="subscription-section-description">
        {t('account.subscription.sections.lifetimeDescription')}
      </p>
      <div className="subscription-grid">
        <Card className={`subscription-tier-card ${hasVanguard ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">
              {t('account.subscription.tiers.vanguard.name')}
            </h2>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.vanguard.description')}
          </p>
          <LifetimeFeatureList columnId="vanguard" />
          {hasVanguard ? (
            <div className="subscription-tier-badge">
              {t('account.subscription.owned')}
            </div>
          ) : (
            !hasFounder &&
            !identityMode && (
              <Button
                onClick={() => onCheckout('vanguard')}
                disabled={actionLoading}
                variant="secondary"
                className="subscription-subscribe-btn"
              >
                {actionLoading ? <Spinner size="sm" /> : t('account.subscription.buyOnce')}
              </Button>
            )
          )}
        </Card>

        <Card className={`subscription-tier-card subscription-tier-featured ${hasFounder ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">
              {t('account.subscription.tiers.founder.name')}
            </h2>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.founder.description')}
          </p>
          <LifetimeFeatureList columnId="founder" />
          {hasFounder ? (
            <div className="subscription-tier-badge">
              {t('account.subscription.owned')}
            </div>
          ) : (
            !identityMode && (
              <Button
                onClick={() => onCheckout('founder')}
                disabled={actionLoading}
                variant="primary"
                className="subscription-subscribe-btn"
              >
                {actionLoading ? <Spinner size="sm" /> : t('account.subscription.buyOnce')}
              </Button>
            )
          )}
        </Card>
      </div>
    </div>
  );
}
