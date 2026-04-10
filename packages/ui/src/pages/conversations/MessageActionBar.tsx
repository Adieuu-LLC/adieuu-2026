import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Portal, Popover } from '@ark-ui/react';
import { EmojiPicker } from '../../components/EmojiPicker';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { getEmojiMartShortcodeLabel } from '../../utils/emojiMartShortcode';

export const MESSAGE_ACTION_BAR_POPOVER_POSITIONING = { placement: 'top' as const, gutter: 0 };

export function MessageActionBar({
  isOwn,
  onDeleteForSelf,
  onDeleteForEveryone,
  onReact,
  onReport,
  onBlock,
  favoriteEmojis,
  onAddFavorite,
  onRemoveFavorite,
  onReply,
  onPopoverOpenChange,
}: {
  isOwn: boolean;
  onDeleteForSelf: () => void;
  onDeleteForEveryone: () => void;
  onReact: (emoji: string) => void;
  onReport?: () => void;
  onBlock?: () => void;
  favoriteEmojis: string[];
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  onReply?: () => void;
  onPopoverOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [showFavPicker, setShowFavPicker] = useState(false);
  const [reactPickerOpen, setReactPickerOpen] = useState(false);

  useEffect(() => {
    onPopoverOpenChange?.(showFavPicker || reactPickerOpen);
  }, [showFavPicker, reactPickerOpen, onPopoverOpenChange]);

  useEffect(() => {
    return () => {
      onPopoverOpenChange?.(false);
    };
  }, [onPopoverOpenChange]);

  return (
    <div className={`message-action-bar${isOwn ? ' message-action-bar--own' : ''}`}>
      {onReply && (
        <Tooltip content={t('conversations.reply', 'Reply')} position="top">
          <button
            type="button"
            className="message-action-bar-btn"
            onClick={onReply}
            aria-label={t('conversations.reply', 'Reply')}
          >
            <Icon name="reply" className="message-action-bar-icon" />
          </button>
        </Tooltip>
      )}
      <div className="message-action-bar-favorites">
        {favoriteEmojis.map((emoji) => (
          <Tooltip
            key={emoji}
            content={`${getEmojiMartShortcodeLabel(emoji)} \u00b7 React \u00b7 Shift+click to remove`}
            position="top"
          >
            <button
              type="button"
              className="message-action-bar-btn message-action-bar-btn--emoji"
              onClick={(e) => {
                if (e.shiftKey) {
                  onRemoveFavorite(emoji);
                } else {
                  onReact(emoji);
                }
              }}
            >
              {emoji}
            </button>
          </Tooltip>
        ))}
        {favoriteEmojis.length < 3 && (
          <Popover.Root
            open={showFavPicker}
            onOpenChange={(e) => setShowFavPicker(e.open)}
            positioning={MESSAGE_ACTION_BAR_POPOVER_POSITIONING}
          >
            <Popover.Trigger asChild>
              <button
                type="button"
                className="message-action-bar-btn message-action-bar-btn--add-fav"
                title="Add favourite reaction"
              >
                <Icon name="plus" className="message-action-bar-icon message-action-bar-icon--sm" />
              </button>
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <Popover.Content className="emoji-picker-popover">
                  <EmojiPicker
                    compact
                    onEmojiSelect={(emoji) => {
                      onAddFavorite(emoji);
                      setShowFavPicker(false);
                    }}
                  />
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>
        )}
      </div>
      <Popover.Root
        open={reactPickerOpen}
        onOpenChange={(e) => setReactPickerOpen(e.open)}
        positioning={MESSAGE_ACTION_BAR_POPOVER_POSITIONING}
      >
        <Popover.Trigger asChild>
          <button type="button" className="message-action-bar-btn" title="React">
            <Icon name="smilePlus" className="message-action-bar-icon" />
          </button>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content className="emoji-picker-popover">
              <EmojiPicker
                compact
                onEmojiSelect={(emoji) => {
                  onReact(emoji);
                }}
              />
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
      <Tooltip content="Delete for me" position="top">
        <button
          type="button"
          className="message-action-bar-btn"
          onClick={onDeleteForSelf}
        >
          <Icon name="trash" className="message-action-bar-icon" />
        </button>
      </Tooltip>
      {isOwn && (
        <Tooltip content="Delete for everyone" position="top">
          <button
            type="button"
            className="message-action-bar-btn"
            onClick={onDeleteForEveryone}
          >
            <Icon name="trash" className="message-action-bar-icon" style={{ color: 'var(--color-error)' }} />
          </button>
        </Tooltip>
      )}
      {(onReport || onBlock) && (
        <Menu.Root>
          <Menu.Trigger asChild>
            <button type="button" className="message-action-bar-btn" aria-label="More actions">
              <Icon name="ellipsis" className="message-action-bar-icon" />
            </button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content className="dm-context-menu">
                {onBlock && (
                  <Menu.Item
                    value="block"
                    className="dm-context-menu-item dm-context-menu-item--danger"
                    onClick={onBlock}
                  >
                    <Icon name="ban" className="dm-context-menu-item-icon" />
                    {t('blocked.blockUserAction', 'Block User')}
                  </Menu.Item>
                )}
                {onReport && (
                  <Menu.Item
                    value="report"
                    className="dm-context-menu-item dm-context-menu-item--danger"
                    onClick={onReport}
                  >
                    <Icon name="warning" className="dm-context-menu-item-icon" />
                    {t('report.reportMessage', 'Report Message')}
                  </Menu.Item>
                )}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      )}
    </div>
  );
}
