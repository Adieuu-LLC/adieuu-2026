import { useTranslation } from 'react-i18next';
import { Checkbox } from '@ark-ui/react';
import { InfoTip } from '../InfoTip';
import { Icon } from '../../icons/Icon';
import type { PendingAttachment } from './composerTypes';

export function ComposerAttachments({
  attachments,
  onRemove,
  stripExif,
  onToggleExif,
  showExifToggle = true,
  sendMp4WithoutReencode,
  onToggleSendMp4WithoutReencode,
  showMp4NoReencodeToggle = false,
  moderationEnabled,
  onToggleModerationEnabled,
  showModerationToggle = false,
}: {
  attachments: PendingAttachment[];
  onRemove: (index: number) => void;
  stripExif: boolean;
  onToggleExif: (strip: boolean) => void;
  /** Hide EXIF toggle when only video attachments are present (no image EXIF). */
  showExifToggle?: boolean;
  /** When all videos are MP4, allow skipping ffmpeg for opaque / HEVC files. */
  sendMp4WithoutReencode?: boolean;
  onToggleSendMp4WithoutReencode?: (value: boolean) => void;
  showMp4NoReencodeToggle?: boolean;
  /** Whether client-side moderation is enabled for this send (default true). */
  moderationEnabled?: boolean;
  onToggleModerationEnabled?: (value: boolean) => void;
  /** Show the moderation opt-out toggle (only when conversation allows skipping). */
  showModerationToggle?: boolean;
}) {
  const { t } = useTranslation();

  if (attachments.length === 0) return null;

  return (
    <div className="conversation-composer-attachments">
      <div className="conversation-composer-attachments-thumbs">
        {attachments.map((att, idx) => (
          <div key={att.previewUrl} className={`conversation-composer-attachment conversation-composer-attachment--${att.uploadStatus}`}>
            {att.file.type.startsWith('video/') ? (
              <video
                src={att.previewUrl}
                className="conversation-composer-attachment-thumb"
                muted
                playsInline
                preload="metadata"
                aria-hidden
              />
            ) : (
              <img src={att.previewUrl} alt="" className="conversation-composer-attachment-thumb" />
            )}
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
      {showExifToggle && (
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
        <InfoTip
          content={t(
            'conversations.metadataWarning',
            'Images often contain metadata (EXIF) such as location, device info, and timestamps that could compromise your privacy or anonymity. By default, we strip this data. Enable this only if you understand the risks.'
          )}
          position="top"
        >
          <span className="conversation-composer-exif-info">
            <Icon name="info" />
          </span>
        </InfoTip>
      </div>
      )}
      {showMp4NoReencodeToggle && onToggleSendMp4WithoutReencode !== undefined && (
        <div className="conversation-composer-exif-row">
          <Checkbox.Root
            checked={sendMp4WithoutReencode === true}
            onCheckedChange={(e) => onToggleSendMp4WithoutReencode(e.checked === true)}
            className="conversation-composer-exif-toggle"
          >
            <Checkbox.Control className="conversation-composer-exif-control" />
            <Checkbox.Label className="conversation-composer-exif-label">
              {t('conversations.sendMp4NoReencode', 'No re-encoding (MP4 only)')}
            </Checkbox.Label>
            <Checkbox.HiddenInput />
          </Checkbox.Root>
          <InfoTip
            content={t(
              'conversations.sendMp4NoReencodeHelp',
              'Send the original MP4 bytes without converting to H.264. Playback and safety scans may fail on some devices; use only when you understand the trade-off.'
            )}
            position="top"
          >
            <span className="conversation-composer-exif-info">
              <Icon name="info" />
            </span>
          </InfoTip>
        </div>
      )}
      {showModerationToggle && onToggleModerationEnabled !== undefined && (
        <div className="conversation-composer-exif-row">
          <Checkbox.Root
            checked={moderationEnabled === true}
            onCheckedChange={(e) => onToggleModerationEnabled(e.checked === true)}
            className="conversation-composer-exif-toggle"
          >
            <Checkbox.Control className="conversation-composer-exif-control" />
            <Checkbox.Label className="conversation-composer-exif-label">
              {t('conversations.enableModeration', 'Enable content moderation')}
            </Checkbox.Label>
            <Checkbox.HiddenInput />
          </Checkbox.Root>
          <InfoTip
            content={
              <>
                <p>{t('conversations.enableModerationTooltip')}</p>
              </>
            }
            position="top"
          >
            <span className="conversation-composer-exif-info">
              <Icon name="info" />
            </span>
          </InfoTip>
        </div>
      )}
    </div>
  );
}
