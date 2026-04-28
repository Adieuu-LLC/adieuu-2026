import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import type { SessionAgeVerification, SessionAliasGate } from '@adieuu/shared';

interface AgeVerificationCardProps {
  ageVerification?: SessionAgeVerification;
  aliasGate?: SessionAliasGate;
}

export function AgeVerificationCard({
  ageVerification,
  aliasGate,
}: AgeVerificationCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const status = ageVerification?.status;
  const gateCode = aliasGate?.code;
  const isRequired = gateCode === 'AGE_VERIFICATION_REQUIRED';
  const isCooldown = gateCode === 'AGE_VERIFICATION_COOLDOWN';
  const isFailed = gateCode === 'AGE_VERIFICATION_FAILED';

  const showCard = status != null || isRequired || isCooldown || isFailed;
  if (!showCard) return null;

  const alertVariant = status === 'verified'
    ? 'success' as const
    : status === 'failed' || isFailed
      ? 'error' as const
      : status === 'expired' || isCooldown
        ? 'warning' as const
        : 'info' as const;

  function renderStatusMessage() {
    if (status === 'verified' && ageVerification?.verifiedAt) {
      return t('account.overview.ageVerification.verifiedAt', {
        date: new Date(ageVerification.verifiedAt).toLocaleDateString(),
      });
    }

    if (status === 'pending') {
      return t('account.overview.ageVerification.statusPending');
    }

    if ((status === 'failed' || isFailed) && ageVerification?.retryAfter) {
      return t('account.overview.ageVerification.retryAfter', {
        date: new Date(ageVerification.retryAfter).toLocaleDateString(),
      });
    }

    if ((status === 'expired' || isCooldown) && ageVerification?.expirationCount != null) {
      const msg = t('account.overview.ageVerification.expirationCount', {
        count: ageVerification.expirationCount,
        max: 3,
      });
      if (ageVerification.retryAfter) {
        return `${msg} -- ${t('account.overview.ageVerification.retryAfter', {
          date: new Date(ageVerification.retryAfter).toLocaleDateString(),
        })}`;
      }
      return msg;
    }

    if (isRequired) {
      return aliasGate?.jurisdiction
        ? t('account.overview.ageVerification.jurisdictionRequired', {
            jurisdiction: aliasGate.jurisdiction,
          })
        : t('account.overview.ageVerification.statusRequired');
    }

    return null;
  }

  const showAction = (isRequired && status !== 'verified') || status === 'pending';
  const isPending = status === 'pending';

  return (
    <Card variant="elevated" className="slide-up" style={{ marginTop: '1.5rem' }}>
      <h2 className="page-title" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
        {t('account.overview.ageVerification.title')}
      </h2>
      <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
        {t('account.overview.ageVerification.subtitle')}
      </p>

      <Alert variant={alertVariant} style={{ marginBottom: '1rem' }}>
        {renderStatusMessage()}
      </Alert>

      {showAction && (
        <div style={{ marginTop: '0.75rem' }}>
          <Button variant="primary" size="md" onClick={() => navigate('/')}>
            {isPending
              ? t('account.overview.ageVerification.resumeButton')
              : t('account.overview.ageVerification.startButton')}
          </Button>
        </div>
      )}
    </Card>
  );
}
