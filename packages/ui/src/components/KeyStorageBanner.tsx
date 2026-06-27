import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';
import { Button } from './Button';
import { usePlatformCapabilities } from '../config/PlatformContext';
import type { StorageStatus } from '../config/types';

/**
 * Persistent banner that warns the user when device encryption key storage
 * is operating in a degraded state (OS keychain unavailable or erroring).
 *
 * Dismissable once per session -- the dismiss state is held in React state,
 * so it resets on logout, page reload, or app relaunch.
 */
export function KeyStorageBanner() {
  const { t } = useTranslation();
  const { secureStorage } = usePlatformCapabilities();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      if (!secureStorage.getStorageStatus) return;
      try {
        const result = await secureStorage.getStorageStatus();
        if (!cancelled) setStatus(result);
      } catch {
        // If we can't even query status, don't block the UI
      }
    }

    checkStatus();
    return () => { cancelled = true; };
  }, [secureStorage]);

  if (dismissed || !status) return null;

  const showWarning = !status.teeAvailable || status.teeFailed;
  if (!showWarning) return null;

  const message = status.teeFailed && status.lastError
    ? t('identity.e2e.keyStorageWarning.teeFailed', { error: status.lastError })
    : t('identity.e2e.keyStorageWarning.teeUnavailable');

  return (
    <div className="key-storage-banner">
      <Alert variant="warning">
        <div className="key-storage-banner-content">
          <span>{message}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="key-storage-banner-dismiss"
          >
            {t('identity.e2e.keyStorageWarning.dismiss')}
          </Button>
        </div>
      </Alert>
    </div>
  );
}
