import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';
import { Button } from './Button';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
import { usePlatform } from '../hooks/usePlatform';

/**
 * Non-intrusive banner shown when an app update is available.
 *
 * On web: prompts the user to refresh the page.
 * On desktop: shows download progress and prompts to restart when ready.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { status, dismiss, applyUpdate } = useUpdateCheck();

  if (status === 'idle' || status === 'dismissed') return null;

  const isDesktop = platform === 'desktop';

  let message: string;
  let actionLabel: string | null = null;

  if (status === 'downloading') {
    message = t('identity.e2e.updateBanner.downloading');
  } else if (status === 'ready') {
    message = t('identity.e2e.updateBanner.ready');
    actionLabel = t('identity.e2e.updateBanner.restart');
  } else {
    message = t('identity.e2e.updateBanner.message');
    actionLabel = isDesktop
      ? t('identity.e2e.updateBanner.restart')
      : t('identity.e2e.updateBanner.refresh');
  }

  return (
    <div className="key-storage-banner">
      <Alert variant="info">
        <div className="key-storage-banner-content">
          <span>{message}</span>
          <div className="update-banner-actions">
            {actionLabel && (
              <Button variant="ghost" size="sm" onClick={applyUpdate}>
                {actionLabel}
              </Button>
            )}
            {status !== 'downloading' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={dismiss}
                className="key-storage-banner-dismiss"
              >
                {t('identity.e2e.updateBanner.later')}
              </Button>
            )}
          </div>
        </div>
      </Alert>
    </div>
  );
}
