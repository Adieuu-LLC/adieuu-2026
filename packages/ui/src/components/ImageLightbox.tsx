import { useEffect, useCallback, useRef, memo } from 'react';
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown);

    requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className="media-lightbox"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={fileName ?? alt ?? t('conversations.mediaLightbox', 'Image preview')}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation prevents backdrop close; keyboard handled at dialog level */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: presentational container preventing click-through */}
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
        ref={closeButtonRef}
        type="button"
        className="media-lightbox-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
          }
        }}
        aria-label={t('common.close', 'Close')}
      >
        &times;
      </button>
    </div>,
    document.body
  );
});
