/**
 * Post-login captcha interstitial for free-tier users.
 *
 * Shown as a non-dismissable modal after account login when the session
 * response includes `captchaRequired: true`. On successful captcha completion,
 * calls the verify endpoint to clear the session flag. On failure, logs
 * the user out.
 */

import { useCallback, useState } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from '../i18n';
import { FriendlyCaptcha } from './FriendlyCaptcha';
import { Button } from './Button';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';

export interface CaptchaInterstitialProps {
  open: boolean;
  sitekey: string;
  onVerified: () => void;
  onFailed: () => void;
}

export function CaptchaInterstitial({
  open,
  sitekey,
  onVerified,
  onFailed,
}: CaptchaInterstitialProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = createApiClient({ baseUrl: apiBaseUrl });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widgetError, setWidgetError] = useState(false);
  const [widgetKey, setWidgetKey] = useState(0);
  const [captchaResponse, setCaptchaResponse] = useState<string | null>(null);

  const handleCaptchaComplete = useCallback((response: string) => {
    setWidgetError(false);
    setCaptchaResponse(response);
  }, []);

  const handleWidgetError = useCallback(() => {
    setWidgetError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setWidgetError(false);
    setCaptchaResponse(null);
    setWidgetKey((k) => k + 1);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!captchaResponse) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await api.auth.verifyCaptcha({
        'frc-captcha-response': captchaResponse,
      });

      if (result.success) {
        onVerified();
      } else {
        setError(t('captcha.verificationFailed'));
        onFailed();
      }
    } catch (err) {
      if (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch'))) {
        setError(t('captcha.networkError'));
      } else {
        setError(t('captcha.verificationFailed'));
        onFailed();
      }
    } finally {
      setSubmitting(false);
    }
  }, [captchaResponse, api, onVerified, onFailed, t]);

  return (
    <Dialog.Root open={open} closeOnEscape={false} closeOnInteractOutside={false}>
      <Portal>
        <Dialog.Backdrop className="captcha-interstitial-backdrop" />
        <Dialog.Positioner className="captcha-interstitial-positioner">
          <Dialog.Content className="geofence-modal-content">
            <Dialog.Title className="geofence-modal-title">
              {t('captcha.interstitialTitle')}
            </Dialog.Title>
            <Dialog.Description className="geofence-modal-description">
              {t('captcha.interstitialDescription')}
            </Dialog.Description>

            <div className="captcha-interstitial-widget">
              <FriendlyCaptcha
                key={widgetKey}
                sitekey={sitekey}
                onComplete={handleCaptchaComplete}
                onError={handleWidgetError}
              />
            </div>

            {widgetError && (
              <p className="geofence-modal-error">{t('captcha.widgetLoadError')}</p>
            )}

            {error && (
              <p className="geofence-modal-error">{error}</p>
            )}

            <div className="geofence-modal-actions">
              {widgetError && (
                <Button variant="secondary" onClick={handleRetry}>
                  {t('captcha.retry')}
                </Button>
              )}
              <Button
                variant="primary"
                disabled={!captchaResponse || submitting}
                aria-busy={submitting}
                onClick={handleSubmit}
              >
                {t('captcha.continue')}
              </Button>
            </div>

            <button
              type="button"
              className="captcha-interstitial-signout"
              onClick={onFailed}
            >
              {t('captcha.signOut')}
            </button>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
