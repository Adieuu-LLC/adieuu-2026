import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_FEEDBACK_ATTACHMENTS } from '@adieuu/shared';
import { Button } from './Button';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { Icon } from '../icons/Icon';

const FEEDBACK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export interface FeedbackAttachmentItem {
  mediaId: string;
  cdnUrl: string;
  contentType: string;
}

interface FeedbackAttachmentUploaderProps {
  attachments: FeedbackAttachmentItem[];
  onChange: (attachments: FeedbackAttachmentItem[]) => void;
  disabled?: boolean;
}

export function FeedbackAttachmentUploader({
  attachments,
  onChange,
  disabled,
}: FeedbackAttachmentUploaderProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingContentType = useRef<string>('image/jpeg');

  const { upload, state, error, reset } = useMediaUpload({
    purpose: 'feedback_attachment',
    maxSizeBytes: FEEDBACK_ATTACHMENT_MAX_BYTES,
    acceptedTypes: ACCEPTED_TYPES,
    onComplete: (mediaId, cdnUrl) => {
      onChange([
        ...attachments,
        { mediaId, cdnUrl, contentType: pendingContentType.current },
      ]);
      reset();
    },
  });

  const canAddMore = attachments.length < MAX_FEEDBACK_ATTACHMENTS;
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

  const hint = useMemo(() => t('feedback.form.attachmentsHint'), [t]);

  return (
    <div className="admin-form-group">
      <label className="input-label">{t('feedback.form.attachments')}</label>
      <p className="input-hint">{hint}</p>

      {attachments.length > 0 && (
        <div className="feedback-attachment-grid">
          {attachments.map((item) => (
            <div key={item.mediaId} className="feedback-attachment-thumb">
              <img src={item.cdnUrl} alt="" />
              <button
                type="button"
                aria-label={t('feedback.form.removeAttachment')}
                onClick={() => removeAttachment(item.mediaId)}
                disabled={disabled}
                className="feedback-attachment-remove"
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
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
        {isUploading ? t('common.loading') : t('feedback.form.addAttachment')}
      </Button>

      {error && <p className="input-error-message">{error}</p>}
    </div>
  );
}
