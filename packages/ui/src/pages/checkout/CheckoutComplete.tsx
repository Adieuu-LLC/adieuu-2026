import { useMemo, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { SiteFooter } from '../../components/SiteFooter';
import { useAppConfig } from '../../config';
import '../../styles/_checkout-complete.scss';

/** Production desktop deep link (see apps/desktop `getCustomScheme` when packaged). */
const DESKTOP_DEEP_LINK_PRODUCTION = 'adieuu://open/account/subscription';
/** Dev desktop scheme when not packaged. */
const DESKTOP_DEEP_LINK_DEV = 'adieuu-dev://open/account/subscription';

export function CheckoutComplete() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { apiBaseUrl } = useAppConfig();
  const [confirming, setConfirming] = useState(false);

  const outcome = useMemo(() => {
    const raw = searchParams.get('status');
    if (raw === 'success') return 'success' as const;
    if (raw === 'cancelled') return 'cancelled' as const;
    return 'unknown' as const;
  }, [searchParams]);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (outcome !== 'success' || !sessionId) return;

    setConfirming(true);
    fetch(`${apiBaseUrl}/api/account/subscription/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .catch(() => { /* non-blocking -- desktop reconciliation will catch up */ })
      .finally(() => setConfirming(false));
  }, [outcome, sessionId, apiBaseUrl]);

  const title =
    outcome === 'success'
      ? t('account.checkout.complete.titleSuccess')
      : outcome === 'cancelled'
        ? t('account.checkout.complete.titleCancelled')
        : t('account.checkout.complete.titleUnknown');

  const body =
    outcome === 'success'
      ? t('account.checkout.complete.bodySuccess')
      : outcome === 'cancelled'
        ? t('account.checkout.complete.bodyCancelled')
        : t('account.checkout.complete.bodyUnknown');

  return (
    <div className="checkout-complete-page">
      <div className="checkout-complete-main">
        <Card className="checkout-complete-card">
          {confirming ? (
            <div className="checkout-complete-confirming">
              <Spinner size="md" />
              <p>{t('account.checkout.complete.confirming')}</p>
            </div>
          ) : (
            <>
              <h1 className="checkout-complete-title">{title}</h1>
              <p className="checkout-complete-body">{body}</p>
              <div className="checkout-complete-actions">
                <a className="btn btn-primary btn-md" href={DESKTOP_DEEP_LINK_PRODUCTION}>
                  {t('account.checkout.complete.openApp')}
                </a>
              </div>
              <Alert variant="info" className="checkout-complete-dev-hint">
                {t('account.checkout.complete.devHint', { devLink: DESKTOP_DEEP_LINK_DEV })}
              </Alert>
            </>
          )}
        </Card>
      </div>
      <SiteFooter />
    </div>
  );
}
