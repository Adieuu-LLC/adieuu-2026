import { useCallback } from 'react';
import type { CommunityCipher } from '@adieuu/crypto';
import type { ComposerSendFn, ComposerReplyContext } from '../../components/composer/composerTypes';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import { parsePayload } from '../../services/messagePayload';
import { encryptContent } from '../../pages/spaces/spaceChannelCipher';

export function useSpaceChannelComposer(params: {
  spaceId: string;
  channelId: string | undefined;
  isEncrypted: boolean;
  spaceCipher: CommunityCipher | null;
  editingMessage: ChannelMessage | null;
  setEditingMessage: (msg: ChannelMessage | null) => void;
  replyContext: ComposerReplyContext | null;
  setReplyContext: (ctx: ComposerReplyContext | null) => void;
  sendMessage: (
    content: string,
    replyToMessageId?: string,
    mentionedIdentityIds?: string[],
    expiresInSeconds?: number,
  ) => Promise<unknown>;
  api: {
    spaces: {
      editMessage: (
        spaceId: string,
        channelId: string,
        messageId: string,
        content: string,
      ) => Promise<unknown>;
    };
  };
}) {
  const {
    spaceId,
    channelId,
    isEncrypted,
    spaceCipher,
    editingMessage,
    setEditingMessage,
    replyContext,
    setReplyContext,
    sendMessage,
    api,
  } = params;

  const onSend: ComposerSendFn = useCallback(
    async (composerPayload: string, options?) => {
      const parsed = parsePayload(composerPayload);
      const hasContent = !!parsed.text || parsed.gifAttachments.length > 0;
      if (!hasContent) return;

      if (editingMessage) {
        if (!spaceId || !channelId) return;
        let content = parsed.isStructured ? composerPayload : parsed.text;
        if (isEncrypted && spaceCipher) {
          content = encryptContent(spaceCipher, content);
        }
        await api.spaces.editMessage(spaceId, channelId, editingMessage.id, content);
        setEditingMessage(null);
        return;
      }

      const replyToMessageId = replyContext?.messageId;
      const mentionedIdentityIds = parsed.mentions
        .map((m) => m.id)
        .filter((id): id is string => !!id);
      const expiresInSeconds = options?.expiresInSeconds;

      let content = parsed.isStructured ? composerPayload : parsed.text;
      if (isEncrypted && spaceCipher) {
        content = encryptContent(spaceCipher, content);
      }

      await sendMessage(
        content,
        replyToMessageId,
        mentionedIdentityIds.length ? mentionedIdentityIds : undefined,
        expiresInSeconds,
      );
      setReplyContext(null);
    },
    [sendMessage, isEncrypted, spaceCipher, editingMessage, api, spaceId, channelId, replyContext, setEditingMessage, setReplyContext],
  );

  return { onSend };
}
