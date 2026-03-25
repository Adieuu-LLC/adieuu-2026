import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Alert } from './Alert';
import { Button } from './Button';
import { usePlatform } from '../hooks/usePlatform';

const DISMISS_KEY = 'web-security-banner-dismissed';

/**
 * Informational banner shown only on the web platform, recommending
 * the desktop app for stronger encryption key protection.
 *
 * Includes an "Open in Desktop" link that launches the desktop app
 * at the user's current route via the adieuu:// custom protocol.
 *
 * Dismissal is persisted to localStorage so users are not re-prompted
 * across sessions.
 */
export function WebSecurityBanner() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  );

  if (platform !== 'web' || dismissed) return null;

  const deepLinkUrl = `adieuu://open${location.pathname}`;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div className="key-storage-banner">
      <Alert variant="info">
        <div className="key-storage-banner-content">
          <span>{t('identity.e2e.webSecurityBanner.message')}</span>
          <div className="key-storage-banner-actions">
            <a
              href={deepLinkUrl}
              className="btn btn-primary btn-sm key-storage-banner-open"
            >
              {t('identity.e2e.webSecurityBanner.openInDesktop')}
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="key-storage-banner-dismiss"
            >
              {t('identity.e2e.webSecurityBanner.dismiss')}
            </Button>
          </div>
        </div>
      </Alert>
    </div>
  );
}
