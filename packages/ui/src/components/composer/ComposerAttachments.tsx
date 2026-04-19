import { useTranslation } from 'react-i18next';
import { Checkbox } from '@ark-ui/react';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';
import type { PendingAttachment } from './composerTypes';

export function ComposerAttachments({
  attachments,
  onRemove,
  stripExif,
  onToggleExif,
}: {
  attachments: PendingAttachment[];
  onRemove: (index: number) => void;
  stripExif: boolean;
  onToggleExif: (strip: boolean) => void;
}) {
  const { t } = useTranslation();

  if (attachments.length === 0) return null;

  return (
    <div className="conversation-composer-attachments">
      <div className="conversation-composer-attachments-thumbs">
        {attachments.map((att, idx) => (
          <div key={att.previewUrl} className={`conversation-composer-attachment conversation-composer-attachment--${att.uploadStatus}`}>
            <img src={att.previewUrl} alt="" className="conversation-composer-attachment-thumb" />
            {att.uploadStatus !== 'pending' && att.uploadStatus !== 'done' && (
              <div className="conversation-composer-attachment-overlay">
                {att.uploadStatus === 'error' ? (
                  <span className="conversation-composer-attachment-error-icon" title={att.uploadError}>
                    <Icon name="error" />
                  </span>
                ) : att.uploadStatus === 'uploading' ? (
                  <div className="conversation-composer-attachment-stage">
                    <span className="conversation-composer-attachment-spinner" />
                    <span className="conversation-composer-attachment-stage-text">
                      {t('conversations.composerAttachmentUploading', 'Uploading')}
                    </span>
                  </div>
                ) : att.uploadStatus === 'scanning' ? (
                  <div className="conversation-composer-attachment-stage">
                    <span className="conversation-composer-attachment-spinner" />
                    <span className="conversation-composer-attachment-stage-text">
                      {t('conversations.composerAttachmentModerating', 'Moderating')}
                    </span>
                  </div>
                ) : (
                  <span className="conversation-composer-attachment-spinner" />
                )}
              </div>
            )}
            {att.uploadStatus === 'done' && (
              <div className="conversation-composer-attachment-done">
                <Icon name="success" />
              </div>
            )}
            {(att.uploadStatus === 'pending' || att.uploadStatus === 'error') && (
              <button
                type="button"
                className="conversation-composer-attachment-remove"
                onClick={() => onRemove(idx)}
                aria-label={t('conversations.removeAttachment', 'Remove attachment')}
              >
                <Icon name="x" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="conversation-composer-exif-row">
        <Checkbox.Root
          checked={!stripExif}
          onCheckedChange={(e) => onToggleExif(e.checked !== true)}
          className="conversation-composer-exif-toggle"
        >
          <Checkbox.Control className="conversation-composer-exif-control" />
          <Checkbox.Label className="conversation-composer-exif-label">
            {t('conversations.includeMetadata', 'Include original metadata')}
          </Checkbox.Label>
          <Checkbox.HiddenInput />
        </Checkbox.Root>
        <Tooltip
          content={t(
            'conversations.metadataWarning',
            'Images often contain metadata (EXIF) such as location, device info, and timestamps that could compromise your privacy or anonymity. By default, we strip this data. Enable this only if you understand the risks.'
          )}
          position="top"
        >
          <span className="conversation-composer-exif-info">
            <Icon name="info" />
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
