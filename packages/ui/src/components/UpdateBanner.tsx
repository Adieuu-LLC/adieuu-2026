import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';
import { Button } from './Button';
import { ProgressBar } from './ProgressBar';
import { useUpdateContext } from '../hooks/useUpdateContext';
import { usePlatform } from '../hooks/usePlatform';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Non-intrusive banner shown when an app update is available.
 *
 * On web: prompts the user to refresh the page.
 * On desktop: supports a two-prompt flow -- download first, then restart.
 *   Shows a progress bar with byte counts during download.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const {
    status,
    newVersion,
    errorMessage,
    downloadProgress,
    installing,
    dismiss,
    applyUpdate,
    downloadUpdate,
    checkForUpdates,
  } = useUpdateContext();

  if (installing) return null;
  if (status === 'idle' || status === 'dismissed' || status === 'up-to-date' || status === 'checking') return null;

  const isDesktop = platform === 'desktop';

  if (status === 'error') {
    const detail = errorMessage
      ? t('identity.e2e.updateBanner.errorMessage', { message: errorMessage })
      : t('identity.e2e.updateBanner.errorGeneric');

    return (
      <div className="key-storage-banner">
        <Alert variant="error">
          <div className="key-storage-banner-content">
            <span>{detail}</span>
            <div className="update-banner-actions">
              <Button variant="ghost" size="sm" onClick={checkForUpdates}>
                {t('identity.e2e.updateBanner.retryUpdate')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismiss}
                className="key-storage-banner-dismiss"
              >
                {t('identity.e2e.updateBanner.later')}
              </Button>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  if (status === 'downloading') {
    const percent = downloadProgress?.percent ?? 0;
    const bytesLabel = downloadProgress && downloadProgress.total > 0
      ? t('identity.e2e.updateBanner.downloadingBytes', {
          transferred: formatBytes(downloadProgress.transferred),
          total: formatBytes(downloadProgress.total),
        })
      : undefined;

    return (
      <div className="key-storage-banner">
        <Alert variant="info">
          <div className="update-banner-progress">
            <div className="update-banner-progress-row">
              <span>{t('identity.e2e.updateBanner.downloadingProgress', { percent: Math.round(percent) })}</span>
              {bytesLabel && <span className="update-banner-progress-text">{bytesLabel}</span>}
            </div>
            <ProgressBar percent={percent} />
          </div>
        </Alert>
      </div>
    );
  }

  let message: string;
  let actionLabel: string | null = null;
  let onAction: (() => void) | null = null;

  if (status === 'ready') {
    message = t('identity.e2e.updateBanner.ready');
    actionLabel = t('identity.e2e.updateBanner.restart');
    onAction = applyUpdate;
  } else if (status === 'available' && isDesktop) {
    message = newVersion
      ? t('identity.e2e.updateBanner.messageVersion', { version: newVersion })
      : t('identity.e2e.updateBanner.message');
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
            <Button
              variant="ghost"
              size="sm"
              onClick={dismiss}
              className="key-storage-banner-dismiss"
            >
              {t('identity.e2e.updateBanner.later')}
            </Button>
          </div>
        </div>
      </Alert>
    </div>
  );
}
