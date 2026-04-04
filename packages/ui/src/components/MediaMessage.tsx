/**
 * Media message rendering component.
 *
 * Renders media attachments in the conversation timeline with multiple states:
 * - uploading: progress bar (sender only, local state)
 * - scanning: placeholder with "Awaiting moderation" text
 * - available: decrypted image with click-to-expand
 * - rejected: "Content removed" notice
 * - error: generic error state
 *
 * Recipients attempt to fetch media via the gated download endpoint.
 * If the server returns 202 (scan pending), a placeholder is shown and
 * the component polls until the scan resolves.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaAttachment } from '../services/messagePayload';

export type MediaMessageState = 'uploading' | 'scanning' | 'available' | 'rejected' | 'error';

export interface MediaMessageProps {
  attachment: MediaAttachment;
  state: MediaMessageState;
  progress?: number;
  /** Decrypted image blob URL (set when state is 'available') */
  imageUrl?: string;
  /** Moderation rejection reason */
  rejectionReason?: string;
  /** Error message */
  errorMessage?: string;
  onRetry?: () => void;
}

export function MediaMessage({
  attachment,
  state,
  progress = 0,
  imageUrl,
  rejectionReason,
  errorMessage,
  onRetry,
}: MediaMessageProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleClick = useCallback(() => {
    if (state === 'available' && imageUrl) {
      setExpanded((prev) => !prev);
    }
  }, [state, imageUrl]);

  useEffect(() => {
    setLoaded(false);
  }, [imageUrl]);

  const aspectRatio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : undefined;

  return (
    <div className="media-message" data-state={state}>
      {state === 'uploading' && (
        <div className="media-message-placeholder" style={{ aspectRatio }}>
          <div className="media-message-progress">
            <div
              className="media-message-progress-bar"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <span className="media-message-status-text">
            {t('conversations.mediaUploading', 'Uploading...')}
          </span>
        </div>
      )}

      {state === 'scanning' && (
        <div className="media-message-placeholder" style={{ aspectRatio }}>
          <span className="media-message-status-text">
            {t('conversations.mediaScanning', 'Awaiting moderation...')}
          </span>
        </div>
      )}

      {state === 'available' && imageUrl && (
        <button
          type="button"
          className={`media-message-image-container${expanded ? ' media-message-image-container--expanded' : ''}`}
          onClick={handleClick}
          aria-label={t('conversations.expandMedia', 'Click to expand')}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt={attachment.fileName ?? ''}
            className="media-message-image"
            style={{ aspectRatio, opacity: loaded ? 1 : 0 }}
            onLoad={() => setLoaded(true)}
            loading="lazy"
          />
          {!loaded && (
            <div className="media-message-placeholder" style={{ aspectRatio }} />
          )}
        </button>
      )}

      {state === 'rejected' && (
        <div className="media-message-placeholder media-message-placeholder--rejected" style={{ aspectRatio }}>
          <span className="media-message-status-text">
            {t('conversations.mediaRejected', 'This content has been removed')}
          </span>
          {rejectionReason && (
            <span className="media-message-reason">{rejectionReason}</span>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="media-message-placeholder media-message-placeholder--error" style={{ aspectRatio }}>
          <span className="media-message-status-text">
            {errorMessage ?? t('conversations.mediaError', 'Failed to load media')}
          </span>
          {onRetry && (
            <button
              type="button"
              className="media-message-retry"
              onClick={onRetry}
            >
              {t('common.retry', 'Retry')}
            </button>
          )}
        </div>
      )}

      {attachment.fileName && state === 'available' && (
        <span className="media-message-filename">{attachment.fileName}</span>
      )}
    </div>
  );
}
