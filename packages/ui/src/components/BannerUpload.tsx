/**
 * BannerUpload - clickable banner area with upload overlay.
 *
 * Shows the current banner (or a gradient placeholder) and allows
 * the user to upload a new banner image. Supports drag-and-drop.
 */

import { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { Icon } from '../icons/Icon';

const BANNER_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BANNER_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface BannerUploadProps {
  currentUrl?: string | null;
  onUploadComplete: (mediaId: string, cdnUrl: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

export function BannerUpload({
  currentUrl,
  onUploadComplete,
  onRemove,
  disabled,
}: BannerUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { upload, reset, state, progress, error } = useMediaUpload({
    purpose: 'banner',
    maxSizeBytes: BANNER_MAX_BYTES,
    acceptedTypes: BANNER_ACCEPTED_TYPES,
    onComplete: (mediaId, cdnUrl) => {
      setPreviewUrl(null);
      onUploadComplete(mediaId, cdnUrl);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      upload(file);
    },
    [upload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFile]
  );

  const handleClick = useCallback(() => {
    if (disabled || state === 'uploading' || state === 'processing') return;
    fileInputRef.current?.click();
  }, [disabled, state]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      reset();
      setPreviewUrl(null);
      onRemove?.();
    },
    [reset, onRemove]
  );

  const displayUrl = previewUrl ?? currentUrl;
  const isWorking = state === 'uploading' || state === 'processing' || state === 'requesting';

  return (
    <div className="banner-upload-wrapper">
      <button
        type="button"
        className={`banner-upload ${isDragging ? 'banner-upload--dragging' : ''}`}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={disabled || isWorking}
        aria-label={currentUrl ? t('identity.profile.changeBanner') : t('identity.profile.uploadBanner')}
      >
        {displayUrl ? (
          <img src={displayUrl} alt="" className="banner-upload-image" />
        ) : (
          <div className="banner-upload-placeholder">
            <Icon name="image" />
            <span>{t('identity.profile.uploadHint')}</span>
          </div>
        )}

        {isWorking && (
          <div className="banner-upload-overlay">
            <div className="banner-upload-progress-bar">
              <div
                className="banner-upload-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="banner-upload-progress-text">
              {state === 'processing'
                ? t('identity.profile.uploadProcessing')
                : `${progress}%`}
            </span>
          </div>
        )}

        {!isWorking && (
          <div className="banner-upload-hover-overlay">
            <Icon name="image" />
            <span>{t('identity.profile.uploadHint')}</span>
          </div>
        )}
      </button>

      {currentUrl && !isWorking && onRemove && (
        <button
          type="button"
          className="banner-upload-remove"
          onClick={handleRemove}
          aria-label={t('identity.profile.removeBanner')}
        >
          <Icon name="x" />
        </button>
      )}

      {error && <p className="banner-upload-error">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept={BANNER_ACCEPTED_TYPES.join(',')}
        onChange={handleFileSelect}
        hidden
      />
    </div>
  );
}
