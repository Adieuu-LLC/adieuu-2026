import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';
import { Button } from './Button';
import { usePlatform } from '../hooks/usePlatform';

const DISMISS_KEY = 'web-security-banner-dismissed';

/**
 * Informational banner shown only on the web platform, recommending
 * the desktop app for stronger encryption key protection.
 *
 * Dismissal is persisted to localStorage so users are not re-prompted
 * across sessions.
 */
export function WebSecurityBanner() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  );

  if (platform !== 'web' || dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div className="key-storage-banner">
      <Alert variant="info">
        <div className="key-storage-banner-content">
          <span>{t('identity.e2e.webSecurityBanner.message')}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="key-storage-banner-dismiss"
          >
            {t('identity.e2e.webSecurityBanner.dismiss')}
          </Button>
        </div>
      </Alert>
    </div>
  );
}
