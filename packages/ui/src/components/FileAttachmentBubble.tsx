/**
 * File attachment display for non-visual files in the message timeline.
 * Shows an icon, filename, size, and a download button.
 * Downloads trigger the E2E decrypt flow and save via a hidden anchor element.
 */

import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaAttachment } from '../services/messagePayload';
import { useE2EMediaDownload } from '../hooks/useE2EMediaDownload';
import { Icon } from '../icons/Icon';
import {
  formatFileSize,
  truncateFileName,
  fileAttachmentIconName,
} from '../utils/fileAttachmentUtils';

export const FileAttachmentBubble = memo(function FileAttachmentBubble({
  attachment,
}: {
  attachment: MediaAttachment;
}) {
  const { t } = useTranslation();
  const { state, imageUrl, errorMessage, retry } = useE2EMediaDownload(attachment);

  const handleDownload = useCallback(() => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = attachment.fileName || 'download';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [imageUrl, attachment.fileName]);

  const sizeLabel = attachment.sizeBytes ? formatFileSize(attachment.sizeBytes) : '';

  return (
    <div
      className="file-attachment-bubble"
      data-state={state}
      data-e2e-media-id={attachment.e2eMediaId}
    >
      <div className="file-attachment-bubble__icon">
        <Icon name={fileAttachmentIconName(attachment.contentType)} />
      </div>
      <div className="file-attachment-bubble__info">
        <span className="file-attachment-bubble__name" title={attachment.fileName}>
          {truncateFileName(attachment.fileName || 'file')}
        </span>
        {sizeLabel && (
          <span className="file-attachment-bubble__size">{sizeLabel}</span>
        )}
      </div>
      <div className="file-attachment-bubble__action">
        {state === 'loading' && (
          <span className="file-attachment-bubble__spinner" />
        )}
        {state === 'scanning' && (
          <span className="file-attachment-bubble__status">
            {t('conversations.mediaScanning', 'Awaiting moderation...')}
          </span>
        )}
        {state === 'available' && imageUrl && (
          <button
            type="button"
            className="file-attachment-bubble__download"
            onClick={handleDownload}
            aria-label={t('conversations.downloadFile', 'Download file')}
          >
            <Icon name="download" />
          </button>
        )}
        {state === 'rejected' && (
          <span className="file-attachment-bubble__rejected">
            {t('conversations.mediaRejected', 'This content cannot be displayed')}
          </span>
        )}
        {state === 'error' && (
          <button
            type="button"
            className="file-attachment-bubble__retry"
            onClick={retry}
            title={errorMessage ?? undefined}
          >
            {t('common.retry', 'Retry')}
          </button>
        )}
      </div>
    </div>
  );
});
