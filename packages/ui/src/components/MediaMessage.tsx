/**
 * Media message rendering component.
 *
 * Renders media attachments in the conversation timeline with multiple states:
 * - loading: spinner (recipient downloading + decrypting)
 * - uploading: progress bar (sender only, local state)
 * - scanning: placeholder with "Awaiting moderation" text
 * - available: decrypted image (lightbox) or inline video with controls
 * - rejected: cannot be displayed + safe reason line
 * - error: generic error state with retry
 */

import { useState, useEffect, useCallback, useRef, memo, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaAttachment } from '../services/messagePayload';
import {
  getContainedMediaDisplaySize,
  MEDIA_MESSAGE_INLINE_MAX_PX,
} from '../utils/mediaMessageDisplaySize';
import { ImageLightbox } from './ImageLightbox';

export type MediaMessageState = 'loading' | 'uploading' | 'scanning' | 'available' | 'rejected' | 'error';

/** `grid`: multi-attachment tile (tighter cap, see .dm-message-attachments). */
export type MediaMessageLayout = 'default' | 'grid';

function hasValidAttachmentDims(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

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
  /** Layout context so placeholder size matches the eventual media box */
  layout?: MediaMessageLayout;
}

export const MediaMessage = memo(function MediaMessage({
  attachment,
  state,
  progress = 0,
  imageUrl,
  rejectionReason,
  errorMessage,
  onRetry,
  layout = 'default',
}: MediaMessageProps) {
  const { t } = useTranslation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loaded, setLoaded] = useState(!!imageUrl);
  const imgRef = useRef<HTMLImageElement>(null);

  const isVideo = attachment.contentType.startsWith('video/');

  const openLightbox = useCallback(() => {
    if (state === 'available' && imageUrl && !isVideo) {
      setLightboxOpen(true);
    }
  }, [state, imageUrl, isVideo]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  useEffect(() => {
    if (!imageUrl) setLoaded(false);
  }, [imageUrl]);

  const aspectRatio =
    hasValidAttachmentDims(attachment.width) && hasValidAttachmentDims(attachment.height)
      ? `${attachment.width} / ${attachment.height}`
      : undefined;

  /** Same "contain" box as .media-message-image / grid tile so loading UI is not full-width then very tall. */
  const { placeholderSizeStyle, placeholderClassName, hasKnownDims } = useMemo(() => {
    const w = attachment.width;
    const h = attachment.height;
    if (!hasValidAttachmentDims(w) || !hasValidAttachmentDims(h)) {
      // No intrinsic dimensions: reserve a sensible fallback box (4:3) so the
      // row does not collapse to zero height and then reflow when media loads.
      const width = layout === 'grid' ? 220 : 260;
      return {
        placeholderSizeStyle: {
          width,
          maxWidth: '100%',
          aspectRatio: '4 / 3',
          boxSizing: 'border-box' as const,
        } as CSSProperties,
        placeholderClassName: 'media-message-placeholder--sized',
        hasKnownDims: false,
      };
    }
    const maxW = layout === 'grid' ? 280 : MEDIA_MESSAGE_INLINE_MAX_PX;
    const maxH = layout === 'grid' ? 200 : MEDIA_MESSAGE_INLINE_MAX_PX;
    const { width, height } = getContainedMediaDisplaySize(w, h, maxW, maxH);
    if (width <= 0 || height <= 0) {
      return {
        placeholderSizeStyle: undefined as CSSProperties | undefined,
        placeholderClassName: '',
        hasKnownDims: false,
      };
    }
    return {
      placeholderSizeStyle: {
        width,
        height,
        maxWidth: '100%',
        boxSizing: 'border-box' as const,
      },
      placeholderClassName: 'media-message-placeholder--sized',
      hasKnownDims: true,
    };
  }, [attachment.width, attachment.height, layout]);

  const phClass = (extra?: string) =>
    `media-message-placeholder${placeholderClassName ? ` ${placeholderClassName}` : ''}${extra ? ` ${extra}` : ''}`;

  const mergePlaceholderStyle = (base?: CSSProperties): CSSProperties =>
    placeholderSizeStyle ? { ...base, ...placeholderSizeStyle } : { ...base, aspectRatio };

  const imageSizeStyle: CSSProperties | undefined =
    hasKnownDims && placeholderSizeStyle
      ? { width: placeholderSizeStyle.width, height: placeholderSizeStyle.height, maxWidth: '100%' }
      : aspectRatio
        ? { aspectRatio }
        : placeholderSizeStyle
          ? {
              width: placeholderSizeStyle.width,
              maxWidth: '100%',
              aspectRatio: '4 / 3',
            }
          : undefined;

  return (
    <div
      className="media-message"
      data-state={state}
      data-e2e-media-id={attachment.e2eMediaId}
    >
      {state === 'loading' && (
        <div className={phClass()} style={mergePlaceholderStyle()}>
          <span className="media-message-spinner" />
          <span className="media-message-status-text">
            {t('conversations.mediaLoading', 'Loading...')}
          </span>
        </div>
      )}

      {state === 'uploading' && (
        <div className={phClass()} style={mergePlaceholderStyle()}>
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
        <div className={phClass()} style={mergePlaceholderStyle()}>
          <span className="media-message-spinner" />
          <span className="media-message-status-text">
            {t('conversations.mediaScanning', 'Awaiting moderation...')}
          </span>
        </div>
      )}

      {state === 'available' && imageUrl && !isVideo && (
        <button
          type="button"
          className="media-message-image-container"
          onClick={openLightbox}
          aria-label={t('conversations.expandMedia', 'Click to expand')}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt={attachment.fileName ?? ''}
            className="media-message-image"
            style={{ ...imageSizeStyle, opacity: loaded ? 1 : 0 }}
            onLoad={() => setLoaded(true)}
          />
          {!loaded && <div className={phClass()} style={mergePlaceholderStyle()} />}
        </button>
      )}

      {state === 'available' && imageUrl && isVideo && (
        <div className="media-message-image-container media-message-image-container--video">
          {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded encrypted media; captions unavailable */}
          <video
            src={imageUrl}
            controls
            playsInline
            className="media-message-image"
            style={imageSizeStyle}
            aria-label={attachment.fileName ?? t('conversations.videoAttachment', 'Video attachment')}
          />
        </div>
      )}

      {state === 'rejected' && (
        <div className="media-message-placeholder media-message-placeholder--rejected" style={{ aspectRatio }}>
          <span className="media-message-status-text">
            {t('conversations.mediaRejected', 'This content cannot be displayed')}
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

      {imageUrl && !isVideo && (
        <ImageLightbox
          src={imageUrl}
          alt={attachment.fileName ?? ''}
          fileName={attachment.fileName}
          isOpen={lightboxOpen}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
});
