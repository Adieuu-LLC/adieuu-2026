import { useCallback } from 'react';
import type { CommunityCipher } from '@adieuu/crypto';
import type { EditSpaceMessageParams, SendSpaceMessageParams } from '@adieuu/shared';
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
  sendMessage: (params: SendSpaceMessageParams) => Promise<unknown>;
  api: {
    spaces: {
      editMessage: (
        spaceId: string,
        channelId: string,
        messageId: string,
        body: EditSpaceMessageParams,
      ) => Promise<{ success: boolean }>;
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
      const hasContent =
        !!parsed.text ||
        parsed.gifAttachments.length > 0 ||
        parsed.attachments.length > 0;
      if (!hasContent) return;

      if (editingMessage) {
        if (!spaceId || !channelId) return;
        const raw = parsed.isStructured ? composerPayload : parsed.text;
        let editBody: EditSpaceMessageParams;
        if (isEncrypted && spaceCipher) {
          editBody = encryptContent(spaceCipher, raw);
        } else {
          editBody = { content: raw };
        }
        const response = await api.spaces.editMessage(
          spaceId,
          channelId,
          editingMessage.id,
          editBody,
        );
        if (response.success === true) {
          setEditingMessage(null);
        }
        return;
      }

      const replyToMessageId = replyContext?.messageId;
      const mentionedIdentityIds = parsed.mentions
        .map((m) => m.id)
        .filter((id): id is string => !!id);
      const expiresInSeconds = options?.expiresInSeconds;

      const raw = parsed.isStructured ? composerPayload : parsed.text;

      const common = {
        clientMessageId: crypto.randomUUID(),
        ...(replyToMessageId ? { replyToMessageId } : {}),
        ...(mentionedIdentityIds.length ? { mentionedIdentityIds } : {}),
        ...(expiresInSeconds != null ? { expiresInSeconds } : {}),
      };

      let msgParams: SendSpaceMessageParams;
      if (isEncrypted && spaceCipher) {
        msgParams = { ...common, ...encryptContent(spaceCipher, raw) };
      } else {
        msgParams = { ...common, content: raw };
      }

      const result = await sendMessage(msgParams);
      if (result) {
        setReplyContext(null);
      }
      return result;
    },
    [sendMessage, isEncrypted, spaceCipher, editingMessage, api, spaceId, channelId, replyContext, setEditingMessage, setReplyContext],
  );

  return { onSend };
}
