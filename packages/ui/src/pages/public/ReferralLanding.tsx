import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createApiClient, storePendingReferralCode } from '@adieuu/shared';
import { AuthLayout } from '../../components/AuthLayout';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { useAppConfig } from '../../config';

export function ReferralLanding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code: rawCode = '' } = useParams<{ code: string }>();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const response = await api.referral.getLanding(rawCode);
      if (cancelled) return;
      setLoading(false);

      if (!response.success || !response.data?.valid) {
        setValid(false);
        setCustomMessage(undefined);
        return;
      }

      setValid(true);
      setCustomMessage(response.data.customMessage);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, rawCode]);

  const handleAccept = () => {
    const normalized = rawCode.trim().toLowerCase();
    storePendingReferralCode(normalized);
    navigate(`/auth/login?ref=${encodeURIComponent(normalized)}`);
  };

  const handleDecline = () => {
    navigate('/auth/login');
  };

  return (
    <AuthLayout
      title={t('account.referral.landing.title')}
      subtitle={valid ? t('account.referral.landing.subtitleValid') : t('account.referral.landing.subtitleInvalid')}
    >
      <Card variant="elevated" className="slide-up">
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-lg)' }}>
            <Spinner />
          </div>
        )}

        {!loading && !valid && (
          <>
            <Alert variant="error">{t('account.referral.landing.invalid')}</Alert>
            <div style={{ marginTop: 'var(--spacing-md)' }}>
              <Button type="button" onClick={handleDecline}>
                {t('account.referral.landing.continueWithout')}
              </Button>
            </div>
          </>
        )}

        {!loading && valid && (
          <>
            {customMessage && (
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <p className="text-muted" style={{ marginBottom: 'var(--spacing-xs)', fontSize: '0.875rem' }}>
                  {t('account.referral.landing.customMessageLabel')}
                </p>
                <blockquote
                  style={{
                    margin: 0,
                    padding: 'var(--spacing-md)',
                    borderLeft: '3px solid var(--color-border-strong)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {customMessage}
                </blockquote>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
              <Button type="button" onClick={handleAccept}>
                {t('account.referral.landing.accept')}
              </Button>
              <Button type="button" variant="ghost" onClick={handleDecline}>
                {t('account.referral.landing.decline')}
              </Button>
            </div>

            <p className="text-muted" style={{ marginTop: 'var(--spacing-md)', fontSize: '0.875rem' }}>
              {t('account.referral.landing.privacyNote')}
            </p>
          </>
        )}

        {!loading && (
          <p style={{ marginTop: 'var(--spacing-lg)', fontSize: '0.875rem' }}>
            <Link to="/">{t('account.referral.landing.backHome')}</Link>
          </p>
        )}
      </Card>
    </AuthLayout>
  );
}
