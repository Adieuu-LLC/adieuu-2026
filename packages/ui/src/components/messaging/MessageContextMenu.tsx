import { useCallback, useMemo, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Portal, Popover } from '@ark-ui/react';
import { EmojiPicker, type EmojiSelectResult } from '../EmojiPicker';
import { useToast } from '../Toast';
import { Icon } from '../../icons/Icon';
import { usePlatformCapabilities } from '../../config';
import { getE2eDecryptedObjectUrlIfAvailable } from '../../hooks/useE2EMediaDownload';
import type { GifAttachment, MediaAttachment } from '../../services/messagePayload';
import type { ReactionCustomEmoji } from '../../services/reactionCryptoService';
import type { PublicCustomEmoji } from '@adieuu/shared';
import { copyImageUrlToSystemClipboard, copyPlainTextToClipboard, downloadUrlWithSaveFile } from '../../utils/contextMenuClipboard';
import {
  e2eAttachmentSupportsCopyImage,
  findE2eAttachment,
  findGifBySlug,
  type MessageContextStash,
  suggestedFileNameForE2eAttachment,
} from '../../utils/contextMenuMedia';
import { MESSAGE_ACTION_BAR_POPOVER_POSITIONING } from './MessageActionBar';

/**
 * Message row context menu: clipboard + media actions, then the chat actions passed as `chatMenuItems`.
 */
export function MessageContextMenuFrame({
  messageRow,
  onStashContext,
  messagePlainText,
  parsedAttachments,
  gifAttachments,
  contextStash,
  showContextReactionPicker,
  onShowContextReactionPicker,
  onReact,
  messageId,
  onContextAction,
  chatMenuItems,
  customEmojis,
}: {
  messageRow: ReactElement;
  onStashContext: (e: React.MouseEvent) => void;
  messagePlainText: string;
  parsedAttachments: MediaAttachment[];
  gifAttachments: GifAttachment[];
  contextStash: MessageContextStash;
  showContextReactionPicker: boolean;
  onShowContextReactionPicker: (open: boolean) => void;
  onReact: (messageId: string, emoji: string, customEmoji?: ReactionCustomEmoji) => void;
  messageId: string;
  onContextAction: (value: string) => void;
  chatMenuItems: ReactNode;
  customEmojis?: PublicCustomEmoji[];
}) {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();
  const { fileSystem } = usePlatformCapabilities();

  const e2eAtt = findE2eAttachment(parsedAttachments, contextStash.e2eMediaId);
  const gifAtt = findGifBySlug(gifAttachments, contextStash.gifSlug);
  const e2eUrl = contextStash.e2eMediaId
    ? getE2eDecryptedObjectUrlIfAvailable(contextStash.e2eMediaId)
    : null;
  const gifUrlForDownload = gifAtt?.url ?? null;
  const gifCopyUrl = contextStash.gifDisplayUrl || gifAtt?.url || null;
  const gifSuggestedName = contextStash.gifSuggestedName || 'gif.webp';
  const isKlipyGifOrSticker = Boolean(gifAtt?.provider === 'klipy');
  const klipyAssetUrlForClipboard = gifAtt?.url ?? null;

  const isLinkMode = Boolean(contextStash.linkHref);
  const showCopySelection = !isLinkMode && contextStash.selection.trim().length > 0;
  const showE2eDownload = Boolean(e2eAtt && e2eUrl);
  const showE2eCopyImage = Boolean(e2eAtt && e2eUrl && e2eAttachmentSupportsCopyImage(e2eAtt));
  const showGifDownload = Boolean(gifAtt && gifUrlForDownload && !isKlipyGifOrSticker);
  const showGifCopyImage = Boolean(gifAtt && gifCopyUrl && !isKlipyGifOrSticker);
  const showKlipyAssetLinkCopy = Boolean(isKlipyGifOrSticker && klipyAssetUrlForClipboard);

  const onClipboardMenuSelect = useCallback(
    async (value: string) => {
      if (value === 'copy-link' && contextStash.linkHref) {
        const ok = await copyPlainTextToClipboard(contextStash.linkHref);
        if (ok) {
          success(t('conversations.contextMenu.copied', 'Copied'));
        } else {
          toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
        }
        return;
      }
      if (value === 'copy-selection' && contextStash.selection) {
        const ok = await copyPlainTextToClipboard(contextStash.selection);
        if (ok) {
          success(t('conversations.contextMenu.copied', 'Copied'));
        } else {
          toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
        }
        return;
      }
      if (value === 'copy-message') {
        const ok = await copyPlainTextToClipboard(messagePlainText);
        if (ok) {
          success(t('conversations.contextMenu.copied', 'Copied'));
        } else {
          toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
        }
        return;
      }
      if (value === 'copy-image-e2e' && e2eUrl) {
        const ok = await copyImageUrlToSystemClipboard(e2eUrl);
        if (ok) {
          success(t('conversations.contextMenu.copied', 'Copied'));
        } else {
          toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
        }
        return;
      }
      if (value === 'copy-image-gif' && gifCopyUrl) {
        const ok = await copyImageUrlToSystemClipboard(gifCopyUrl);
        if (ok) {
          success(t('conversations.contextMenu.copied', 'Copied'));
        } else {
          toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
        }
        return;
      }
      if (value === 'copy-klipy-asset-link' && klipyAssetUrlForClipboard) {
        const ok = await copyPlainTextToClipboard(klipyAssetUrlForClipboard);
        if (ok) {
          success(t('conversations.contextMenu.copied', 'Copied'));
        } else {
          toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
        }
        return;
      }
      if (value === 'download-e2e' && e2eUrl && e2eAtt) {
        const name = suggestedFileNameForE2eAttachment(e2eAtt);
        const ok = await downloadUrlWithSaveFile(e2eUrl, name, (data, suggestedName) =>
          fileSystem.saveFile(data, suggestedName),
        );
        if (ok) {
          success(t('conversations.contextMenu.fileSaved', 'File saved'));
        } else {
          toastError(t('conversations.contextMenu.downloadFailed', 'Could not download file'));
        }
        return;
      }
      if (value === 'download-gif' && gifUrlForDownload) {
        const ok = await downloadUrlWithSaveFile(
          gifUrlForDownload,
          gifSuggestedName,
          (data, suggestedName) => fileSystem.saveFile(data, suggestedName),
        );
        if (ok) {
          success(t('conversations.contextMenu.fileSaved', 'File saved'));
        } else {
          toastError(t('conversations.contextMenu.downloadFailed', 'Could not download file'));
        }
        return;
      }
    },
    [
      contextStash.linkHref,
      contextStash.selection,
      e2eAtt,
      e2eUrl,
      fileSystem,
      gifAtt,
      gifCopyUrl,
      gifSuggestedName,
      gifUrlForDownload,
      klipyAssetUrlForClipboard,
      messagePlainText,
      success,
      t,
      toastError,
    ],
  );

  const handleSelect = useCallback(
    (details: { value: string | null }) => {
      const value = details.value;
      if (!value) {
        return;
      }
      if (
        value === 'copy-link' ||
        value === 'copy-selection' ||
        value === 'copy-message' ||
        value === 'copy-image-e2e' ||
        value === 'copy-image-gif' ||
        value === 'copy-klipy-asset-link' ||
        value === 'download-e2e' ||
        value === 'download-gif'
      ) {
        void onClipboardMenuSelect(value);
        return;
      }
      onContextAction(value);
    },
    [onClipboardMenuSelect, onContextAction],
  );

  const contextMenuContent = useMemo(
    () => (
      <Portal>
        <Menu.Positioner>
          <Menu.Content className="dm-context-menu">
            {isLinkMode && contextStash.linkHref && (
              <Menu.Item value="copy-link" className="dm-context-menu-item">
                <Icon name="link" className="dm-context-menu-item-icon" />
                {t('conversations.contextMenu.copyLink', 'Copy link')}
              </Menu.Item>
            )}
            {!isLinkMode && showCopySelection && (
              <Menu.Item value="copy-selection" className="dm-context-menu-item">
                <Icon name="copy" className="dm-context-menu-item-icon" />
                {t('conversations.contextMenu.copySelection', 'Copy selection')}
              </Menu.Item>
            )}
            <Menu.Item value="copy-message" className="dm-context-menu-item">
              <Icon name="message" className="dm-context-menu-item-icon" />
              {t('conversations.contextMenu.copyMessage', 'Copy message')}
            </Menu.Item>
            {showE2eDownload && (
              <Menu.Item value="download-e2e" className="dm-context-menu-item">
                <Icon name="download" className="dm-context-menu-item-icon" />
                {t('conversations.contextMenu.download', 'Download')}
              </Menu.Item>
            )}
            {showE2eCopyImage && (
              <Menu.Item value="copy-image-e2e" className="dm-context-menu-item">
                <Icon name="image" className="dm-context-menu-item-icon" />
                {t('conversations.contextMenu.copyImage', 'Copy image')}
              </Menu.Item>
            )}
            {showGifDownload && (
              <Menu.Item value="download-gif" className="dm-context-menu-item">
                <Icon name="download" className="dm-context-menu-item-icon" />
                {t('conversations.contextMenu.download', 'Download')}
              </Menu.Item>
            )}
            {showKlipyAssetLinkCopy && (
              <Menu.Item value="copy-klipy-asset-link" className="dm-context-menu-item">
                <Icon
                  name={gifAtt?.type === 'sticker' ? 'noteSticky' : 'film'}
                  className="dm-context-menu-item-icon"
                />
                {gifAtt?.type === 'sticker'
                  ? t('conversations.contextMenu.copyStickerLink', 'Copy sticker link')
                  : t('conversations.contextMenu.copyGifLink', 'Copy GIF link')}
              </Menu.Item>
            )}
            {showGifCopyImage && (
              <Menu.Item value="copy-image-gif" className="dm-context-menu-item">
                <Icon name="image" className="dm-context-menu-item-icon" />
                {t('conversations.contextMenu.copyImage', 'Copy image')}
              </Menu.Item>
            )}
            <hr className="dm-context-menu-separator" />
            {chatMenuItems}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    ),
    [
      isLinkMode,
      contextStash.linkHref,
      showCopySelection,
      showE2eDownload,
      showE2eCopyImage,
      showGifCopyImage,
      showGifDownload,
      showKlipyAssetLinkCopy,
      gifAtt?.type,
      chatMenuItems,
      t,
    ],
  );

  const messageRowWithContext = useMemo(() => {
    if (!isValidElement(messageRow)) {
      return messageRow;
    }
    const props = messageRow.props as { onContextMenu?: (e: React.MouseEvent) => void };
    const prev = props.onContextMenu;
    return cloneElement(messageRow, {
      onContextMenu: (e: React.MouseEvent) => {
        prev?.(e);
        onStashContext(e);
      },
    } as never);
  }, [messageRow, onStashContext]);

  return (
    <Popover.Root
      open={showContextReactionPicker}
      onOpenChange={(e) => onShowContextReactionPicker(e.open)}
      positioning={MESSAGE_ACTION_BAR_POPOVER_POSITIONING}
    >
      <Menu.Root onSelect={(d) => handleSelect({ value: d.value as string | null })}>
        <Menu.ContextTrigger asChild>
          <Popover.Anchor asChild>{messageRowWithContext}</Popover.Anchor>
        </Menu.ContextTrigger>
        {contextMenuContent}
      </Menu.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content className="emoji-picker-popover emoji-picker-popover--context">
            <EmojiPicker
              customEmojis={customEmojis}
              onEmojiSelect={(result: EmojiSelectResult) => {
                if (result.native) {
                  onReact(messageId, result.native);
                } else if (result.custom) {
                  onReact(messageId, `custom:${result.custom.id}`, {
                    id: result.custom.id,
                    url: result.custom.cdnUrl,
                    name: result.custom.name,
                    shortcode: result.custom.shortcode,
                    animated: result.custom.animated,
                  });
                }
                onShowContextReactionPicker(false);
              }}
            />
            <button
              type="button"
              className="emoji-picker-popover-close"
              onClick={() => onShowContextReactionPicker(false)}
            >
              x
            </button>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
