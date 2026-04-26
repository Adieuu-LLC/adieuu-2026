import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import '../../styles/_checkout-complete.scss';

/** Production desktop deep link (see apps/desktop `getCustomScheme` when packaged). */
const DESKTOP_DEEP_LINK_PRODUCTION = 'adieuu://open/account/subscription';
/** Dev desktop scheme when not packaged. */
const DESKTOP_DEEP_LINK_DEV = 'adieuu-dev://open/account/subscription';

export function CheckoutComplete() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const outcome = useMemo(() => {
    const raw = searchParams.get('status');
    if (raw === 'success') return 'success' as const;
    if (raw === 'cancelled') return 'cancelled' as const;
    return 'unknown' as const;
  }, [searchParams]);

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
      <Card className="checkout-complete-card">
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
      </Card>
    </div>
  );
}
