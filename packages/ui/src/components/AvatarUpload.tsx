/**
 * AvatarUpload - clickable circular avatar with upload overlay.
 *
 * Shows the current avatar (or a placeholder) and allows the user to
 * upload a new one. Displays upload progress and processing state inline.
 * Reusable for any avatar-type upload throughout the app.
 */

import { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaUpload, type MediaUploadState } from '../hooks/useMediaUpload';
import { Icon } from '../icons/Icon';

const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface AvatarUploadProps {
  currentUrl?: string | null;
  onUploadComplete: (mediaId: string, cdnUrl: string) => void;
  onRemove?: () => void;
  size?: number;
  disabled?: boolean;
}

export function AvatarUpload({
  currentUrl,
  onUploadComplete,
  onRemove,
  size = 96,
  disabled,
}: AvatarUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { upload, reset, state, progress, error } = useMediaUpload({
    purpose: 'avatar',
    maxSizeBytes: AVATAR_MAX_BYTES,
    acceptedTypes: AVATAR_ACCEPTED_TYPES,
    onComplete: (mediaId, cdnUrl) => {
      setPreviewUrl(null);
      onUploadComplete(mediaId, cdnUrl);
    },
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      upload(file);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [upload]
  );

  const handleClick = useCallback(() => {
    if (disabled || state === 'uploading' || state === 'processing') return;
    fileInputRef.current?.click();
  }, [disabled, state]);

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
    <div className="avatar-upload" style={{ width: size, height: size }}>
      <button
        type="button"
        className="avatar-upload-button"
        onClick={handleClick}
        disabled={disabled || isWorking}
        aria-label={currentUrl ? t('identity.profile.changeAvatar') : t('identity.profile.uploadAvatar')}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt=""
            className="avatar-upload-image"
            style={{ width: size, height: size }}
          />
        ) : (
          <div className="avatar-upload-placeholder" style={{ width: size, height: size }}>
            <Icon name="camera" />
          </div>
        )}

        {isWorking && (
          <div className="avatar-upload-overlay">
            <div className="avatar-upload-progress">
              <svg viewBox="0 0 36 36" className="avatar-upload-ring">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-border)" strokeWidth="2" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="var(--color-accent-primary)"
                  strokeWidth="2"
                  strokeDasharray={`${progress} ${100 - progress}`}
                  strokeDashoffset="25"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        )}

        {!isWorking && (
          <div className="avatar-upload-hover-overlay">
            <Icon name="camera" />
          </div>
        )}
      </button>

      {currentUrl && !isWorking && onRemove && (
        <button
          type="button"
          className="avatar-upload-remove"
          onClick={handleRemove}
          aria-label={t('identity.profile.removeAvatar')}
        >
          <Icon name="x" />
        </button>
      )}

      {error && <p className="avatar-upload-error">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_ACCEPTED_TYPES.join(',')}
        onChange={handleFileSelect}
        hidden
      />
    </div>
  );
}
