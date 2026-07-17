import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelMessage } from './channelMessage';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';
import {
  formatMessageTime,
  formatAbsoluteTime,
} from '../../pages/conversations/conversationUtils';
import { EditHistoryLabel, type EditHistoryEntry } from './EditHistoryLabel';

export interface MessageMetaStripProps {
  message: ChannelMessage;
  deviceSignatureTrustIcon: ReactNode;
  signatureWarningIcon: ReactNode;
  fsDowngradeIcon: ReactNode;
  fsInfo?: { rotationLabel: string; readableWindow: string; tooltip: string };
  isPinned: boolean;
  countdown: string | null;
  /** 'header' for linear layout header, 'footer' for bubble layout footer */
  variant: 'header' | 'footer';
  /** Loader for edit history entries. When provided, the "Edited" label becomes interactive. */
  loadEditHistory?: (messageId: string) => Promise<EditHistoryEntry[] | null>;
}

export function MessageMetaStrip({
  message,
  deviceSignatureTrustIcon,
  signatureWarningIcon,
  fsDowngradeIcon,
  fsInfo,
  isPinned,
  countdown,
  variant,
  loadEditHistory,
}: MessageMetaStripProps) {
  const { t } = useTranslation();

  return (
    <>
      {variant === 'footer' && (
        <Tooltip content={formatAbsoluteTime(message.createdAt)} position="top">
          <span className="dm-message-time">
            {formatMessageTime(message.createdAt)}
          </span>
        </Tooltip>
      )}
      {(message.revisionCount ?? 0) > 0 && (
        loadEditHistory
          ? <EditHistoryLabel
              lastEditedAt={message.lastEditedAt}
              loadHistory={() => loadEditHistory(message.id)}
              className="dm-message-edited-label"
              variant={variant}
            />
          : <span className="dm-message-edited-label">{t('conversations.messageEdited')}</span>
      )}
      {deviceSignatureTrustIcon}
      {signatureWarningIcon}
      {isPinned && (
        <span className="dm-message-pin-indicator" title={t('conversations.pinnedMessage', 'Pinned')}>
          <Icon name="locationPin" size="sm" />
          <span className="dm-message-pin-indicator__label">{t('conversations.pinnedMessage', 'Pinned')}</span>
        </span>
      )}
      {fsInfo && message.forwardSecrecy !== undefined && (
        <Tooltip
          content={message.forwardSecrecy
            ? fsInfo.tooltip
            : t('conversations.fsIndicatorOff', 'No forward secrecy. This message remains readable as long as your device keys exist.')
          }
          position="top"
        >
          <span
            className={`dm-message-fs-indicator${message.forwardSecrecy ? ' dm-message-fs-indicator--active' : ''}`}
          >
            {message.forwardSecrecy && `FS ${fsInfo.readableWindow}`}
          </span>
        </Tooltip>
      )}
      {fsDowngradeIcon}
      {countdown && (
        <Tooltip content={t('conversations.ttlCountdown', 'This message will disappear when the timer expires')} position="top">
          <span className="dm-message-expiry">{countdown}</span>
        </Tooltip>
      )}
    </>
  );
}
