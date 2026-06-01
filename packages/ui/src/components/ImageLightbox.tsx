import { useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface ImageLightboxProps {
  src: string;
  alt?: string;
  fileName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageLightbox = memo(function ImageLightbox({
  src,
  alt,
  fileName,
  isOpen,
  onClose,
}: ImageLightboxProps) {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="media-lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={fileName ?? alt ?? t('conversations.mediaLightbox', 'Image preview')}
    >
      <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt ?? ''}
          className="media-lightbox-image"
        />
        {fileName && (
          <span className="media-lightbox-filename">{fileName}</span>
        )}
      </div>
      <button
        type="button"
        className="media-lightbox-close"
        onClick={onClose}
        aria-label={t('common.close', 'Close')}
      >
        &times;
      </button>
    </div>,
    document.body
  );
});
