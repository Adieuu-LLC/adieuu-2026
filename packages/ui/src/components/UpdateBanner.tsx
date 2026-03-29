import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';
import { Button } from './Button';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
import { usePlatform } from '../hooks/usePlatform';

/**
 * Non-intrusive banner shown when an app update is available.
 *
 * On web: prompts the user to refresh the page.
 * On desktop: supports a two-prompt flow -- download first, then restart.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { status, dismiss, applyUpdate, downloadUpdate } = useUpdateCheck();

  if (status === 'idle' || status === 'dismissed' || status === 'up-to-date' || status === 'checking') return null;

  const isDesktop = platform === 'desktop';

  let message: string;
  let actionLabel: string | null = null;
  let onAction: (() => void) | null = null;

  if (status === 'downloading') {
    message = t('identity.e2e.updateBanner.downloading');
  } else if (status === 'ready') {
    message = t('identity.e2e.updateBanner.ready');
    actionLabel = t('identity.e2e.updateBanner.restart');
    onAction = applyUpdate;
  } else if (status === 'available' && isDesktop) {
    message = t('identity.e2e.updateBanner.message');
    actionLabel = t('identity.e2e.updateBanner.download');
    onAction = downloadUpdate;
  } else {
    message = t('identity.e2e.updateBanner.message');
    actionLabel = isDesktop
      ? t('identity.e2e.updateBanner.restart')
      : t('identity.e2e.updateBanner.refresh');
    onAction = applyUpdate;
  }

  return (
    <div className="key-storage-banner">
      <Alert variant="info">
        <div className="key-storage-banner-content">
          <span>{message}</span>
          <div className="update-banner-actions">
            {actionLabel && onAction && (
              <Button variant="ghost" size="sm" onClick={onAction}>
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
