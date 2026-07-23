import { memo, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Portal } from '@ark-ui/react';
import type { PublicCustomEmoji } from '@adieuu/shared';
import { EmojiPicker, type EmojiSelectResult } from '../EmojiPicker';
import { GifPicker, type ContentTab } from '../GifPicker';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';
import type { ComposerControlConfig } from './composerTypes';
import { MAX_ATTACHMENTS } from './composerTypes';
import { ComposerTTLMenu } from './ComposerTTLMenu';
import { ComposerSendIcon } from './ComposerSendIcon';
import type { GifAttachment } from '../../services/messagePayload';

export type ComposerRailSharedProps = {
  sending: boolean;
  canSendMessage: boolean;
  forwardSecrecy?: { enabled: boolean; onToggle: () => void };
  ttlSeconds: number | undefined;
  onSelectTtl: (seconds: number | undefined) => void;
  attachmentCount: number;
  gifsDisabled?: boolean;
  attachmentsDisabled?: boolean;
  showMediaPicker: boolean;
  onMediaPickerOpenChange: (open: boolean) => void;
  lastMediaTab: ContentTab;
  onMediaTabChange: (tab: ContentTab) => void;
  onGifSelect: (gif: GifAttachment) => void;
  onGifSendNow: (gif: GifAttachment) => void;
  /** Only pass when the media picker is open to avoid message-list churn. */
  lastMessageText?: string;
  channelId: string;
  showEmojiPicker: boolean;
  onEmojiPickerOpenChange: (open: boolean) => void;
  onEmojiSelect: (result: EmojiSelectResult) => void;
  customEmojisDisabled?: boolean;
  customEmojis?: PublicCustomEmoji[];
  onSend: () => void;
  onAttachClick: () => void;
  focusInput: () => void;
};

function useRenderComposerControl(props: ComposerRailSharedProps) {
  const { t } = useTranslation();
  const {
    sending,
    canSendMessage,
    forwardSecrecy,
    ttlSeconds,
    onSelectTtl,
    attachmentCount,
    gifsDisabled,
    attachmentsDisabled,
    showMediaPicker,
    onMediaPickerOpenChange,
    lastMediaTab,
    onMediaTabChange,
    onGifSelect,
    onGifSendNow,
    lastMessageText,
    channelId,
    showEmojiPicker,
    onEmojiPickerOpenChange,
    onEmojiSelect,
    customEmojisDisabled,
    customEmojis,
    onSend,
    onAttachClick,
    focusInput,
  } = props;

  return (control: ComposerControlConfig) => {
    switch (control.id) {
      case 'forwardSecrecy':
        if (!forwardSecrecy) return null;
        return (
          <Tooltip
            key={control.id}
            content={
              forwardSecrecy.enabled
                ? t('conversations.fsEnabled', 'Forward secrecy is on for this message')
                : t('conversations.fsDisabled', 'Forward secrecy is off for this message')
            }
            position="top"
          >
            <button
              type="button"
              className={`conversation-fs-toggle${forwardSecrecy.enabled ? ' conversation-fs-toggle--active' : ''}`}
              onClick={() => {
                forwardSecrecy.onToggle();
                requestAnimationFrame(focusInput);
              }}
            >
              FS
            </button>
          </Tooltip>
        );
      case 'timedMessage':
        return (
          <ComposerTTLMenu
            key={control.id}
            ttlSeconds={ttlSeconds}
            onSelect={onSelectTtl}
            onAfterSelect={() => requestAnimationFrame(focusInput)}
          />
        );
      case 'upload':
        if (attachmentsDisabled) return null;
        return (
          <Tooltip key={control.id} content={t('conversations.attachMedia')} position="top">
            <button
              type="button"
              className="conversation-attach-btn"
              onClick={onAttachClick}
              disabled={sending || attachmentCount >= MAX_ATTACHMENTS}
            >
              <Icon name="upload" />
            </button>
          </Tooltip>
        );
      case 'gif':
        if (gifsDisabled) return null;
        return (
          <Popover.Root
            key={control.id}
            open={showMediaPicker}
            onOpenChange={(e) => onMediaPickerOpenChange(e.open)}
            positioning={{ placement: 'top-end' }}
            lazyMount
            unmountOnExit
          >
            <Popover.Anchor asChild>
              <span className="composer-popover-anchor">
                <Tooltip content={t('gif.composerButtonCombined', 'GIFs and Stickers')} position="top">
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="conversation-media-btn"
                      disabled={sending}
                    >
                      <span className="conversation-media-btn__label">GIF</span>
                    </button>
                  </Popover.Trigger>
                </Tooltip>
              </span>
            </Popover.Anchor>
            <Portal>
              <Popover.Positioner>
                <Popover.Content className="gif-picker-popover">
                  <GifPicker
                    onGifSelect={onGifSelect}
                    onGifSendNow={onGifSendNow}
                    initialTab={lastMediaTab}
                    onTabChange={onMediaTabChange}
                    lastMessageText={lastMessageText}
                    conversationId={channelId}
                  />
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>
        );
      case 'emoji':
        return (
          <Popover.Root
            key={control.id}
            open={showEmojiPicker}
            onOpenChange={(e) => onEmojiPickerOpenChange(e.open)}
            positioning={{ placement: 'top-end' }}
            lazyMount
            unmountOnExit
          >
            <Popover.Anchor asChild>
              <span className="composer-popover-anchor">
                <Tooltip content={t('conversations.emojiButton', 'Emoji')} position="top">
                  <Popover.Trigger asChild>
                    <button type="button" className="message-composer-emoji-btn">
                      <Icon name="smile" className="message-composer-emoji-icon" />
                    </button>
                  </Popover.Trigger>
                </Tooltip>
              </span>
            </Popover.Anchor>
            <Portal>
              <Popover.Positioner>
                <Popover.Content className="emoji-picker-popover">
                  <EmojiPicker
                    onEmojiSelect={onEmojiSelect}
                    customEmojis={!customEmojisDisabled ? customEmojis : undefined}
                  />
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>
        );
      case 'send':
        return (
          <Tooltip key={control.id} content={t('conversations.send', 'Send')} position="top">
            <button
              type="button"
              className="conversation-composer-send-btn"
              onClick={onSend}
              disabled={!canSendMessage}
              aria-label={t('conversations.send', 'Send')}
            >
              {control.sendShowText && (
                <span className="conversation-composer-send-btn__label">
                  {t('conversations.send', 'Send')}
                </span>
              )}
              <ComposerSendIcon icon={control.sendIcon ?? 'paper-plane'} />
            </button>
          </Tooltip>
        );
      default:
        return null;
    }
  };
}

export const ComposerLeftRail = memo(function ComposerLeftRail({
  controls,
  controlsRef,
  ...shared
}: ComposerRailSharedProps & {
  controls: ComposerControlConfig[];
  controlsRef: Ref<HTMLDivElement>;
}) {
  const renderControl = useRenderComposerControl(shared);
  return (
    <div className="conversation-composer-row__left" ref={controlsRef}>
      {controls.map((control) => renderControl(control))}
    </div>
  );
});

export const ComposerRightRail = memo(function ComposerRightRail({
  controls,
  controlsRef,
  disabled,
  ...shared
}: ComposerRailSharedProps & {
  controls: ComposerControlConfig[];
  controlsRef: Ref<HTMLDivElement>;
  disabled?: boolean;
}) {
  const renderControl = useRenderComposerControl(shared);
  return (
    <div
      className="conversation-composer-row__right"
      ref={controlsRef}
      style={disabled ? { display: 'none' } : undefined}
    >
      {controls.map((control) => renderControl(control))}
    </div>
  );
});
