import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { useIdentityModal } from '../../hooks/useIdentityModal';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import type {
  AgeVerificationDetails,
  PublicJurisdictionRequirement,
  SessionAgeVerification,
  SessionAliasGate,
} from '@adieuu/shared';

interface AgeVerificationCardProps {
  ageVerification?: SessionAgeVerification;
  aliasGate?: SessionAliasGate;
  details?: AgeVerificationDetails;
  jurisdictionReqs?: PublicJurisdictionRequirement[];
}

export function AgeVerificationCard({
  ageVerification,
  aliasGate,
  details,
  jurisdictionReqs,
}: AgeVerificationCardProps) {
  const { t } = useTranslation();
  const { openIdentityModal } = useIdentityModal();
  const [urlCopied, setUrlCopied] = useState(false);

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

  const jurisdictionCode =
    details?.jurisdiction ?? aliasGate?.jurisdiction;
  const matchedReq = jurisdictionCode
    ? jurisdictionReqs?.find(
        (r) => r.jurisdiction.toUpperCase() === jurisdictionCode.toUpperCase(),
      )
    : undefined;

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
        <StatusMessage
          status={status}
          ageVerification={ageVerification}
          aliasGate={aliasGate}
          details={details}
          isRequired={isRequired}
          isFailed={isFailed}
          isCooldown={isCooldown}
        />
      </Alert>

      {details?.optedIn && (
        <p className="account-detail-muted" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          {t('account.overview.ageVerification.optedInLabel')}
        </p>
      )}

      <DetailsRows details={details} />

      {matchedReq && (
        <JurisdictionContext req={matchedReq} />
      )}

      {showAction && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
          <Button variant="primary" size="md" onClick={() => openIdentityModal()}>
            {isPending
              ? t('account.overview.ageVerification.resumeButton')
              : t('account.overview.ageVerification.startButton')}
          </Button>

          {isPending && details?.redirectUrl && (
            <CopyUrlButton
              url={details.redirectUrl}
              copied={urlCopied}
              onCopied={setUrlCopied}
            />
          )}
        </div>
      )}

      {isPending && details?.redirectUrl && (
        <p className="account-detail-muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          {t('account.overview.ageVerification.copyUrlHint')}
        </p>
      )}
    </Card>
  );
}

function StatusMessage({
  status,
  ageVerification,
  aliasGate,
  details,
  isRequired,
  isFailed,
  isCooldown,
}: {
  status?: string;
  ageVerification?: SessionAgeVerification;
  aliasGate?: SessionAliasGate;
  details?: AgeVerificationDetails;
  isRequired: boolean;
  isFailed: boolean;
  isCooldown: boolean;
}) {
  const { t } = useTranslation();

  if (status === 'verified' && ageVerification?.verifiedAt) {
    const msg = t('account.overview.ageVerification.verifiedAt', {
      date: new Date(ageVerification.verifiedAt).toLocaleDateString(),
    });
    if (details?.approvalMethod) {
      return (
        <>
          {msg}
          {' -- '}
          {t('account.overview.ageVerification.approvalMethod', {
            method: details.approvalMethod.replaceAll('_', ' '),
          })}
        </>
      );
    }
    return <>{msg}</>;
  }

  if (status === 'pending') {
    return <>{t('account.overview.ageVerification.statusPending')}</>;
  }

  if ((status === 'failed' || isFailed) && ageVerification?.retryAfter) {
    return (
      <>
        {t('account.overview.ageVerification.retryAfter', {
          date: new Date(ageVerification.retryAfter).toLocaleDateString(),
        })}
      </>
    );
  }

  if ((status === 'expired' || isCooldown) && ageVerification?.expirationCount != null) {
    const msg = t('account.overview.ageVerification.expirationCount', {
      count: ageVerification.expirationCount,
      max: 3,
    });
    if (ageVerification.retryAfter) {
      return (
        <>
          {msg}
          {' -- '}
          {t('account.overview.ageVerification.retryAfter', {
            date: new Date(ageVerification.retryAfter).toLocaleDateString(),
          })}
        </>
      );
    }
    return <>{msg}</>;
  }

  if (isRequired) {
    return (
      <>
        {aliasGate?.jurisdiction
          ? t('account.overview.ageVerification.jurisdictionRequired', {
              jurisdiction: aliasGate.jurisdiction,
            })
          : t('account.overview.ageVerification.statusRequired')}
      </>
    );
  }

  return null;
}

function DetailsRows({ details }: { details?: AgeVerificationDetails }) {
  const { t } = useTranslation();
  if (!details) return null;

  const rows: Array<{ label: string; value: string }> = [];

  if (details.jurisdiction) {
    rows.push({
      label: t('account.overview.ageVerification.jurisdictionLabel'),
      value: details.jurisdiction,
    });
  }

  if (details.startedAt) {
    rows.push({
      label: t('account.overview.ageVerification.startedAt', {
        date: new Date(details.startedAt).toLocaleString(),
      }),
      value: '',
    });
  }

  if (details.expiresAt && (details.status === 'started' || details.status === 'pending')) {
    rows.push({
      label: t('account.overview.ageVerification.expiresAt', {
        date: new Date(details.expiresAt).toLocaleString(),
      }),
      value: '',
    });
  }

  if (details.completedAt && details.status !== 'started' && details.status !== 'pending') {
    rows.push({
      label: t('account.overview.ageVerification.completedAt', {
        date: new Date(details.completedAt).toLocaleString(),
      }),
      value: '',
    });
  }

  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="account-detail-row"
          style={{ fontSize: '0.9rem' }}
        >
          <span className="account-detail-muted">{row.label}</span>
          {row.value && (
            <span className="account-detail-value" style={{ marginLeft: '0.5rem' }}>
              {row.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function JurisdictionContext({ req }: { req: PublicJurisdictionRequirement }) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.1))',
        borderRadius: '8px',
        padding: '0.75rem',
        marginBottom: '0.75rem',
        fontSize: '0.9rem',
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {req.jurisdictionName}
        {req.status === 'proposed' && (
          <span
            style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              opacity: 0.8,
            }}
          >
            {t('account.overview.compliance.proposed')}
          </span>
        )}
      </div>

      {req.legislation.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <span className="account-detail-muted" style={{ display: 'block', marginBottom: '0.25rem' }}>
            {t('account.overview.ageVerification.legislationLabel')}
          </span>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {req.legislation.map((leg) => (
              <li key={leg.name} style={{ fontSize: '0.85rem' }}>
                {leg.url ? (
                  <a href={leg.url} target="_blank" rel="noopener noreferrer">
                    {leg.name}
                  </a>
                ) : (
                  leg.name
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {req.notes && (
        <p className="account-detail-muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
          {req.notes}
        </p>
      )}
    </div>
  );
}

function CopyUrlButton({
  url,
  copied,
  onCopied,
}: {
  url: string;
  copied: boolean;
  onCopied: (v: boolean) => void;
}) {
  const { t } = useTranslation();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      onCopied(true);
      setTimeout(() => onCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable in some contexts
    }
  }, [url, onCopied]);

  return (
    <Button variant="secondary" size="md" onClick={handleCopy}>
      <Icon name={copied ? 'check' : 'copy'} style={{ marginRight: '0.35rem' }} />
      {copied
        ? t('account.overview.ageVerification.urlCopied')
        : t('account.overview.ageVerification.copyUrl')}
    </Button>
  );
}
