/**
 * Floating action bar that appears above a chat message on hover.
 * Designed for reuse across DMs, group chats, and Spaces.
 */

import { type ReactNode, useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover } from './Popover';
import { Tooltip } from './Tooltip';
import { InfoCircleIcon, EllipsisHorizontalIcon } from './Icons';

// ============================================================================
// Types
// ============================================================================

export interface MessageMetadata {
  messageId: string;
  sentAt: string;
  cryptoProfile: string;
  forwardSecrecy: boolean;
  expiresAt?: string;
  conversationId: string;
  clientMessageId: string;
}

export interface MessageActionBarProps {
  /** Metadata to display in the info popover */
  metadata: MessageMetadata;
  /** Content for the "more options" dropdown menu */
  menuContent?: ReactNode;
  /** Whether the bar is visible */
  visible: boolean;
  /** Whether the message is from the current user (affects positioning) */
  isOwn: boolean;
  /** Whether any interactive action is in progress */
  disabled?: boolean;
  /** Called when any popover in the bar opens or closes */
  onPopoverOpenChange?: (open: boolean) => void;
}

// ============================================================================
// Sub-components
// ============================================================================

const InfoPopoverContent = memo(function InfoPopoverContent({
  metadata,
}: {
  metadata: MessageMetadata;
}) {
  const { t } = useTranslation();

  const rows: { label: string; value: string }[] = [
    { label: t('messages.info.messageId'), value: metadata.messageId },
    { label: t('messages.info.sentAt'), value: new Date(metadata.sentAt).toLocaleString() },
    { label: t('messages.info.cryptoProfile'), value: metadata.cryptoProfile },
    {
      label: t('messages.info.forwardSecrecy'),
      value: metadata.forwardSecrecy ? t('messages.info.enabled') : t('messages.info.disabled'),
    },
    ...(metadata.expiresAt
      ? [{ label: t('messages.info.expiresAt'), value: new Date(metadata.expiresAt).toLocaleString() }]
      : []),
    { label: t('messages.info.conversationId'), value: metadata.conversationId },
    { label: t('messages.info.clientMessageId'), value: metadata.clientMessageId },
  ];

  return (
    <div className="message-action-bar-info">
      <table className="message-action-bar-info-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="message-action-bar-info-label">{row.label}</td>
              <td className="message-action-bar-info-value">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ============================================================================
// Main component
// ============================================================================

export const MessageActionBar = memo(function MessageActionBar({
  metadata,
  menuContent,
  visible,
  isOwn,
  disabled,
  onPopoverOpenChange,
}: MessageActionBarProps) {
  const { t } = useTranslation();
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleInfoOpenChange = useCallback(
    (open: boolean) => {
      setInfoOpen(open);
      onPopoverOpenChange?.(open || menuOpen);
    },
    [menuOpen, onPopoverOpenChange],
  );

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      onPopoverOpenChange?.(open || infoOpen);
    },
    [infoOpen, onPopoverOpenChange],
  );

  const isAnyPopoverOpen = infoOpen || menuOpen;
  if (!visible && !isAnyPopoverOpen) return null;

  return (
    <div
      className={`message-action-bar ${isOwn ? 'message-action-bar--own' : ''}`}
    >
      <Popover
        trigger={
          <button
            className="message-action-bar-btn"
            aria-label={t('messages.messageInfo')}
            disabled={disabled}
          >
            <Tooltip content={t('messages.messageInfo')} position="top">
              <InfoCircleIcon className="message-action-bar-icon" />
            </Tooltip>
          </button>
        }
        positioning={{ placement: isOwn ? 'bottom-end' : 'bottom-start' }}
        onOpenChange={handleInfoOpenChange}
      >
        <InfoPopoverContent metadata={metadata} />
      </Popover>

      {menuContent && (
        <Popover
          trigger={
            <button
              className="message-action-bar-btn"
              aria-label={t('messages.moreOptions')}
              disabled={disabled}
            >
              <Tooltip content={t('messages.moreOptions')} position="top">
                <EllipsisHorizontalIcon className="message-action-bar-icon" />
              </Tooltip>
            </button>
          }
          positioning={{ placement: isOwn ? 'bottom-end' : 'bottom-start' }}
          onOpenChange={handleMenuOpenChange}
        >
          {menuContent}
        </Popover>
      )}
    </div>
  );
});
