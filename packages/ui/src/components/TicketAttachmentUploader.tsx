import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_TICKET_ATTACHMENTS } from '@adieuu/shared';
import { Button } from './Button';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { Icon } from '../icons/Icon';

const TICKET_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];

export interface TicketAttachmentItem {
  mediaId: string;
  cdnUrl: string;
  contentType: string;
  previewUrl?: string;
}

interface TicketAttachmentUploaderProps {
  attachments: TicketAttachmentItem[];
  onChange: (attachments: TicketAttachmentItem[]) => void;
  disabled?: boolean;
}

export function TicketAttachmentUploader({
  attachments,
  onChange,
  disabled,
}: TicketAttachmentUploaderProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingContentType = useRef<string>('image/jpeg');

  const { upload, state, error, reset } = useMediaUpload({
    purpose: 'ticket_attachment',
    maxSizeBytes: TICKET_ATTACHMENT_MAX_BYTES,
    acceptedTypes: ACCEPTED_TYPES,
    onComplete: (mediaId, cdnUrl) => {
      onChange([
        ...attachments,
        { mediaId, cdnUrl, contentType: pendingContentType.current },
      ]);
      reset();
    },
  });

  const canAddMore = attachments.length < MAX_TICKET_ATTACHMENTS;
  const isUploading = state === 'requesting' || state === 'uploading' || state === 'processing';

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      pendingContentType.current = file.type || 'image/jpeg';
      e.target.value = '';
      await upload(file);
    },
    [upload],
  );

  const removeAttachment = useCallback(
    (mediaId: string) => {
      onChange(attachments.filter((a) => a.mediaId !== mediaId));
    },
    [attachments, onChange],
  );

  const hint = useMemo(
    () => t('support.form.attachmentsHint'),
    [t],
  );

  return (
    <div className="admin-form-group">
      <label className="input-label" htmlFor="ticket-attachment-input">{t('support.form.attachments')}</label>
      <p className="input-hint">{hint}</p>

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          {attachments.map((item) => (
            <div
              key={item.mediaId}
              style={{
                position: 'relative',
                width: '5rem',
                height: '5rem',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
              }}
            >
              {item.contentType.startsWith('video/') ? (
                <video
                  src={item.cdnUrl}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                />
              ) : (
                <img
                  src={item.cdnUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
              <button
                type="button"
                aria-label={t('support.form.removeAttachment')}
                onClick={() => removeAttachment(item.mediaId)}
                disabled={disabled}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  background: 'var(--color-surface-overlay)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        id="ticket-attachment-input"
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={(e) => void handleFileChange(e)}
        style={{ display: 'none' }}
        disabled={disabled || !canAddMore || isUploading}
      />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || !canAddMore || isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? t('common.loading') : t('support.form.addAttachment')}
      </Button>

      {error && <p className="input-error-message">{error}</p>}
    </div>
  );
}
