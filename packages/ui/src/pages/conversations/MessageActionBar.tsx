import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Portal, Popover } from '@ark-ui/react';
import { EmojiPicker, type EmojiSelectResult } from '../../components/EmojiPicker';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { getEmojiMartShortcodeLabel } from '../../utils/emojiMartShortcode';
import type { PublicCustomEmoji } from '@adieuu/shared';
import type { ReactionCustomEmoji } from '../../services/reactionCryptoService';
import {
  isCustomEmojiFavorite,
  customEmojiFavoriteId,
  toCustomEmojiFavorite,
} from '../../hooks/useFavoriteEmojis';

export const MESSAGE_ACTION_BAR_POPOVER_POSITIONING = { placement: 'top' as const, gutter: 0 };

function resolveCustomEmojiReaction(
  result: EmojiSelectResult,
): { emoji: string; customEmoji?: ReactionCustomEmoji } | null {
  if (result.native) return { emoji: result.native };
  if (result.custom) {
    return {
      emoji: `custom:${result.custom.id}`,
      customEmoji: {
        id: result.custom.id,
        url: result.custom.cdnUrl,
        name: result.custom.name,
        animated: result.custom.animated,
      },
    };
  }
  return null;
}

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
  editAction,
  onPopoverOpenChange,
  canManagePin = false,
  isPinned = false,
  onPin,
  onUnpin,
  customEmojis,
}: {
  isOwn: boolean;
  onDeleteForSelf: () => void;
  onDeleteForEveryone: () => void;
  onReact: (emoji: string, customEmoji?: ReactionCustomEmoji) => void;
  onReport?: () => void;
  onBlock?: () => void;
  favoriteEmojis: string[];
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  onReply?: () => void;
  editAction?: { state: 'enabled'; onClick: () => void } | { state: 'disabled'; reason: string };
  onPopoverOpenChange?: (open: boolean) => void;
  canManagePin?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  customEmojis?: PublicCustomEmoji[];
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

  const customEmojiLookup = useMemo(() => {
    if (!customEmojis?.length) return new Map<string, PublicCustomEmoji>();
    return new Map(customEmojis.map((e) => [e.id, e]));
  }, [customEmojis]);

  function renderFavoriteButton(fav: string) {
    if (isCustomEmojiFavorite(fav)) {
      const ceId = customEmojiFavoriteId(fav);
      const ce = customEmojiLookup.get(ceId);
      if (!ce) return null;
      const tooltipLabel = `${ce.name} \u00b7 React \u00b7 Shift+click to remove`;
      return (
        <Tooltip key={fav} content={tooltipLabel} position="top">
          <button
            type="button"
            className="message-action-bar-btn message-action-bar-btn--emoji"
            onClick={(e) => {
              if (e.shiftKey) {
                onRemoveFavorite(fav);
              } else {
                onReact(`custom:${ce.id}`, {
                  id: ce.id,
                  url: ce.cdnUrl,
                  name: ce.name,
                  animated: ce.animated,
                });
              }
            }}
          >
            <img
              src={ce.cdnUrl}
              alt={ce.name}
              className="message-action-bar-custom-emoji"
              width={20}
              height={20}
              loading="lazy"
            />
          </button>
        </Tooltip>
      );
    }

    return (
      <Tooltip
        key={fav}
        content={`${getEmojiMartShortcodeLabel(fav)} \u00b7 React \u00b7 Shift+click to remove`}
        position="top"
      >
        <button
          type="button"
          className="message-action-bar-btn message-action-bar-btn--emoji"
          onClick={(e) => {
            if (e.shiftKey) {
              onRemoveFavorite(fav);
            } else {
              onReact(fav);
            }
          }}
        >
          {fav}
        </button>
      </Tooltip>
    );
  }

  function handleFavPickerSelect(result: EmojiSelectResult) {
    if (result.native) {
      onAddFavorite(result.native);
    } else if (result.custom) {
      onAddFavorite(toCustomEmojiFavorite(result.custom.id));
    }
    setShowFavPicker(false);
  }

  function handleReactPickerSelect(result: EmojiSelectResult) {
    const resolved = resolveCustomEmojiReaction(result);
    if (resolved) {
      onReact(resolved.emoji, resolved.customEmoji);
    }
  }

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
      {editAction && (
        editAction.state === 'enabled' ? (
          <Tooltip content={t('conversations.editMessage')} position="top">
            <button
              type="button"
              className="message-action-bar-btn"
              onClick={editAction.onClick}
              aria-label={t('conversations.editMessage')}
            >
              <Icon name="pen" className="message-action-bar-icon" />
            </button>
          </Tooltip>
        ) : (
          <Tooltip content={editAction.reason} position="top">
            <span className="message-action-bar-edit-disabled-wrap">
              <button
                type="button"
                className="message-action-bar-btn message-action-bar-btn--disabled"
                disabled
                aria-label={editAction.reason}
                title={editAction.reason}
              >
                <Icon name="pen" className="message-action-bar-icon" />
              </button>
            </span>
          </Tooltip>
        )
      )}
      {canManagePin && onPin && onUnpin && (
        <Tooltip
          content={
            isPinned
              ? t('conversations.unpinMessage', 'Unpin message')
              : t('conversations.pinMessage', 'Pin message')
          }
          position="top"
        >
          <button
            type="button"
            className={`message-action-bar-btn${isPinned ? ' message-action-bar-btn--pinned' : ''}`}
            onClick={() => (isPinned ? onUnpin() : onPin())}
            aria-label={
              isPinned
                ? t('conversations.unpinMessage', 'Unpin message')
                : t('conversations.pinMessage', 'Pin message')
            }
          >
            <Icon name="locationPin" className="message-action-bar-icon" />
          </button>
        </Tooltip>
      )}
      <div className="message-action-bar-favorites">
        {favoriteEmojis.map((fav) => renderFavoriteButton(fav))}
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
                    onEmojiSelect={handleFavPickerSelect}
                    customEmojis={customEmojis}
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
                onEmojiSelect={handleReactPickerSelect}
                customEmojis={customEmojis}
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
