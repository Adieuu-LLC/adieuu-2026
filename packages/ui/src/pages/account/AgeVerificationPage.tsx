import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../icons/Icon';
import { JurisdictionRequirementDisclosure } from '../../components/compliance/JurisdictionRequirementDisclosure';
import { useAuth } from '../../hooks/useAuth';
import { useIdentity } from '../../hooks/useIdentity';
import { useAgeVerification } from '../../hooks/useAgeVerification';
import { useAppConfig } from '../../config';
import {
  createApiClient,
  expandedJurisdictionCodesForRequirements,
  type PublicJurisdictionRequirement,
} from '@adieuu/shared';

const VERIFYMY_PRIVACY_URL = 'https://verifymy.io/privacy-policy';
const VERIFYMY_LEARN_URL = 'https://verifymy.io/developer-documentation/age-verification-estimation/';
const ADIEUU_PRIVACY_URL = '/legal-policies/privacy-policy';

export function AgeVerificationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { apiBaseUrl } = useAppConfig();
  const { hasIdentity, canCreateMore } = useIdentity();
  const av = useAgeVerification();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const isOptIn = searchParams.get('optIn') === '1';
  const [optInCountry, setOptInCountry] = useState('');

  const [jurisdictionReqs, setJurisdictionReqs] = useState<PublicJurisdictionRequirement[]>([]);
  const [jreqLoading, setJreqLoading] = useState(false);

  const geo = session?.geo;
  useEffect(() => {
    if (!geo) {
      setJurisdictionReqs([]);
      return;
    }
    const codes = expandedJurisdictionCodesForRequirements(geo);
    let cancelled = false;
    setJreqLoading(true);
    void (async () => {
      const res = await api.geo.getJurisdictionRequirements(codes);
      if (cancelled) return;
      if (res.success && res.data) {
        setJurisdictionReqs(res.data);
      } else {
        setJurisdictionReqs([]);
      }
      setJreqLoading(false);
    })();
    return () => { cancelled = true; };
  }, [api, geo]);

  const isEmailAccount = session?.identifierType === 'email';
  const email = isEmailAccount ? session?.identifier : undefined;
  const isPending = session?.ageVerification?.status === 'pending';

  const handleAgree = () => {
    if (isOptIn) {
      av.optIn(optInCountry.trim().toUpperCase() || undefined);
    } else {
      av.start();
    }
  };

  const handleDecline = () => {
    navigate('/');
  };

  // Gate-only states: user landed on the page but has a failed/cooldown gate
  const aliasGate = session?.aliasGate;
  const gateCode = aliasGate?.code;
  const isFailed = gateCode === 'AGE_VERIFICATION_FAILED';
  const isCooldown = gateCode === 'AGE_VERIFICATION_COOLDOWN';

  return (
    <div className="age-verification-page">
      <div className="age-verification-card slide-up">
        {/* Gate-only: failed */}
        {av.status === 'idle' && isFailed && (
          <>
            <div className="age-verification-header">
              <h1>{t('compliance.ageVerification.title')}</h1>
            </div>
            <Alert variant="error">
              {t('compliance.ageVerification.failedMessage')}
            </Alert>
            {aliasGate?.retryAfter && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                {t('compliance.ageVerification.retryAfterLabel')}: {new Date(aliasGate.retryAfter).toLocaleDateString()}
              </p>
            )}
          </>
        )}

        {/* Gate-only: cooldown */}
        {av.status === 'idle' && isCooldown && !isFailed && (
          <>
            <div className="age-verification-header">
              <h1>{t('compliance.ageVerification.title')}</h1>
            </div>
            <Alert variant="warning">
              {t('compliance.ageVerification.cooldownMessage')}
            </Alert>
            {aliasGate?.retryAfter && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                {t('compliance.ageVerification.retryAfterLabel')}: {new Date(aliasGate.retryAfter).toLocaleDateString()}
              </p>
            )}
            {session?.ageVerification?.expirationCount !== undefined && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                {t('compliance.ageVerification.expirationCount', {
                  count: session.ageVerification.expirationCount,
                  max: 3,
                })}
              </p>
            )}
          </>
        )}

        {/* Idle consent view */}
        {av.status === 'idle' && !isFailed && !isCooldown && (
          <>
            <div className="age-verification-header">
              <h1>
                {isEmailAccount
                  ? t('compliance.ageVerification.emailConsentPageTitle')
                  : t('compliance.ageVerification.title')}
              </h1>
            </div>

            {isOptIn && (
              <div className="age-verification-opt-in-country">
                <Input
                  label={t('compliance.advisory.countryLabel')}
                  placeholder="US"
                  value={optInCountry}
                  onChange={(e) => setOptInCountry(e.target.value)}
                  maxLength={2}
                />
              </div>
            )}

            {isEmailAccount && email ? (
              <>
                {/* <div className="age-verification-email">
                  <div className="age-verification-email-label">
                    {t('compliance.ageVerification.emailConsentEmailLabel')}
                  </div>
                  <div className="age-verification-email-value">{email}</div>
                </div> */}

                {(jurisdictionReqs.length > 0 || jreqLoading) && (
                  <JurisdictionRequirementDisclosure
                    rows={jurisdictionReqs}
                    loading={jreqLoading}
                    primaryJurisdiction={aliasGate?.jurisdiction ?? geo?.jurisdiction}
                  />
                )}

                <div className="age-verification-info-rows">
                  <div className="age-verification-info-row">
                    <div className="age-verification-info-icon">
                      <Icon name="info" />
                    </div>
                    <div className="age-verification-info-content">
                      <h3>{t('compliance.ageVerification.emailConsentInfoShareIntro')}</h3>
                      <p>
                        {t('compliance.ageVerification.emailConsentInfoShareIntroBody')}{' '}
                      </p>
                    </div>
                  </div>

                  <div className="age-verification-info-row">
                    <div className="age-verification-info-icon">
                      <Icon name="search" />
                    </div>
                    <div className="age-verification-info-content">
                      <h3>{t('compliance.ageVerification.emailConsentInfoShareTitle')}</h3>
                      <p>
                        {t('compliance.ageVerification.emailConsentInfoShareBody')}{' '}
                        <a href={VERIFYMY_LEARN_URL} target="_blank" rel="noopener noreferrer">
                          {t('compliance.ageVerification.emailConsentLearnVerifyMy')}
                        </a>
                      </p>
                    </div>
                  </div>

                  <div className="age-verification-info-row">
                    <div className="age-verification-info-icon">
                      <Icon name="server" />
                    </div>
                    <div className="age-verification-info-content">
                      <h3>{t('compliance.ageVerification.emailConsentInfoAgeTitle')}</h3>
                      <p>
                        {t('compliance.ageVerification.emailConsentInfoAgeBody')}{' '}
                        <a href={ADIEUU_PRIVACY_URL}>
                          {t('compliance.ageVerification.emailConsentLearnAgeVerification')}
                        </a>
                      </p>
                    </div>
                  </div>

                  <div className="age-verification-info-row">
                    <div className="age-verification-info-icon">
                      <Icon name="shield" />
                    </div>
                    <div className="age-verification-info-content">
                      <h3>{t('compliance.ageVerification.emailConsentInfoInstantTitle')}</h3>
                      <p>{t('compliance.ageVerification.emailConsentInfoInstantBody')}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)', margin: 0 }}>
                {t('compliance.ageVerification.phoneOnlyIntro')}
              </p>
            )}

            <div className="age-verification-actions">
              <Button variant="secondary" size="lg" onClick={handleDecline}>
                {t('compliance.ageVerification.emailConsentDecline')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={handleAgree}
                disabled={isOptIn && optInCountry.trim().length !== 2}
              >
                {isPending
                  ? t('compliance.ageVerification.resumeButton')
                  : t('compliance.ageVerification.emailConsentAgree')}
              </Button>
            </div>
          </>
        )}

        {/* Starting */}
        {av.status === 'starting' && (
          <div className="age-verification-status">
            <Spinner size="md" />
            <p>{t('compliance.ageVerification.starting')}</p>
          </div>
        )}

        {/* Approved */}
        {av.status === 'approved' && (
          <>
            <div className="age-verification-status">
              <Alert variant="success">
                {t('compliance.ageVerification.approved')}
              </Alert>
            </div>
            <div className="age-verification-actions">
              {hasIdentity && (
                <Button variant="primary" size="lg" onClick={() => navigate('/')}>
                  <Icon name="lock" />
                  {t('compliance.ageVerification.loginToAlias')}
                </Button>
              )}
              {canCreateMore && (
                <Button
                  variant={hasIdentity ? 'secondary' : 'primary'}
                  size="lg"
                  onClick={() => navigate('/')}
                >
                  <Icon name="plus" />
                  {t('compliance.ageVerification.createAlias')}
                </Button>
              )}
              {!hasIdentity && !canCreateMore && (
                <Button variant="primary" size="lg" onClick={() => navigate('/')}>
                  {t('compliance.ageVerification.goToDashboard')}
                </Button>
              )}
            </div>
          </>
        )}

        {/* Email check inconclusive */}
        {av.status === 'email_check_inconclusive' && (
          <>
            <Alert variant="warning">
              {t('compliance.ageVerification.emailCheckInconclusive')}
            </Alert>
            <div className="age-verification-actions">
              <Button variant="primary" size="lg" onClick={() => av.continueInteractive()}>
                {t('compliance.ageVerification.continueOtherMethods')}
              </Button>
            </div>
          </>
        )}

        {/* Awaiting user / Polling */}
        {(av.status === 'awaiting_user' || av.status === 'polling') && (
          <div className="age-verification-status">
            <Spinner size="md" />
            <p>
              {av.status === 'awaiting_user'
                ? t('compliance.ageVerification.awaitingUser')
                : t('compliance.ageVerification.processing')}
            </p>
            {av.secondsUntilNextPoll != null && (
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {t('compliance.ageVerification.nextCheckIn', { seconds: av.secondsUntilNextPoll })}
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { av.cancel(); navigate('/'); }}
            >
              {t('compliance.ageVerification.doLater')}
            </Button>
          </div>
        )}

        {/* Failed */}
        {av.status === 'failed' && (
          <>
            <Alert variant="error">
              {t('compliance.ageVerification.failedMessage')}
            </Alert>
            <div className="age-verification-actions">
              <Button variant="primary" size="lg" onClick={() => av.start()}>
                {t('compliance.ageVerification.retryButton')}
              </Button>
            </div>
          </>
        )}

        {/* Expired */}
        {av.status === 'expired' && (
          <>
            <Alert variant="warning">
              {t('compliance.ageVerification.expiredMessage')}
            </Alert>
            <div className="age-verification-actions">
              <Button variant="primary" size="lg" onClick={() => av.start()}>
                {t('compliance.ageVerification.retryButton')}
              </Button>
            </div>
          </>
        )}

        {/* Subscription required */}
        {av.status === 'subscription_required' && (
          <>
            <Alert variant="warning">
              {av.billingCode === 'SUBSCRIPTION_EXPIRED'
                ? t('compliance.subscription.expiredDescription')
                : t('compliance.subscription.description')}
            </Alert>
            <div className="age-verification-actions">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/account/subscription')}
              >
                {t('compliance.subscription.subscribeCta')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
