import { useCallback, useMemo, useState } from 'react';
import type { CommunityCipher } from '@adieuu/crypto';
import type { PublicIdentity } from '@adieuu/shared';
import type { TFunction } from 'i18next';
import type { ComposerReplyContext } from '../../components/composer/composerTypes';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import type { EditHistoryEntry } from '../../components/messaging/EditHistoryLabel';
import { parsePayload } from '../../services/messagePayload';
import { decryptEditHistoryEntry } from '../../pages/spaces/spaceChannelCipher';

export function useSpaceChannelMessageActions(params: {
  spaceId: string;
  channelId: string | undefined;
  isEncrypted: boolean;
  spaceCipher: CommunityCipher | null;
  participantProfiles: Record<string, PublicIdentity>;
  api: {
    spaces: {
      deleteMessage: (spaceId: string, channelId: string, messageId: string) => Promise<unknown>;
      modDeleteMessage: (spaceId: string, channelId: string, messageId: string) => Promise<unknown>;
      getMessage: (spaceId: string, channelId: string, messageId: string) => Promise<{
        success: boolean;
        data?: unknown;
      }>;
    };
  };
  t: TFunction;
}) {
  const { spaceId, channelId, isEncrypted, spaceCipher, participantProfiles, api, t } = params;

  const [replyContext, setReplyContext] = useState<ComposerReplyContext | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChannelMessage | null>(null);

  const handleReply = useCallback(
    (msg: ChannelMessage) => {
      const name =
        participantProfiles[msg.fromIdentityId]?.displayName ??
        participantProfiles[msg.fromIdentityId]?.username ??
        msg.fromIdentityId.slice(0, 8);
      const snippet = msg.body
        ? msg.body.split(/\s+/).slice(0, 6).join(' ') +
          (msg.body.split(/\s+/).length > 6 ? '…' : '')
        : t('conversations.replyOriginal', 'Original message');
      setReplyContext({
        messageId: msg.id,
        authorName: name,
        snippet,
        onCancel: () => setReplyContext(null),
      });
    },
    [participantProfiles, t],
  );

  const handleStartEdit = useCallback((msg: ChannelMessage) => {
    if (msg.revisionCount >= 3) return;
    setEditingMessage(msg);
    setReplyContext(null);
  }, []);

  const handleDeleteMessage = useCallback(
    (messageId: string, forEveryone: boolean) => {
      if (!spaceId || !channelId) return;
      void (async () => {
        try {
          if (forEveryone) {
            await api.spaces.modDeleteMessage(spaceId, channelId, messageId);
          } else {
            await api.spaces.deleteMessage(spaceId, channelId, messageId);
          }
        } catch {
          // TODO: show error toast
        }
      })();
    },
    [api, spaceId, channelId],
  );

  const editingInitialPlaintext = useMemo(() => {
    if (!editingMessage?.body) return '';
    return parsePayload(editingMessage.body).text;
  }, [editingMessage]);

  const editingInitialAttachments = useMemo(() => {
    if (!editingMessage) return undefined;
    return {
      media: editingMessage.attachments ?? [],
      gifs: editingMessage.gifAttachments ?? [],
    };
  }, [editingMessage]);

  const loadEditHistory = useCallback(
    async (messageId: string): Promise<EditHistoryEntry[] | null> => {
      if (!spaceId || !channelId) return null;
      try {
        const res = await api.spaces.getMessage(spaceId, channelId, messageId);
        if (!res.success || !res.data) return null;
        type RevisionEntry = { content?: string; ciphertext?: string; nonce?: string; cipherId?: string; replacedAt: string };
        const history = (res.data as { revisionHistory?: RevisionEntry[] }).revisionHistory;
        if (!history || history.length === 0) return [];

        return history.map((entry) => {
          if (isEncrypted && spaceCipher) {
            const result = decryptEditHistoryEntry(entry, spaceCipher);
            if ('plaintext' in result) return { replacedAt: entry.replacedAt, plaintext: result.plaintext };
            return { replacedAt: entry.replacedAt, decryptionError: result.decryptionError };
          }
          return { replacedAt: entry.replacedAt, plaintext: entry.content ?? '' };
        });
      } catch {
        return null;
      }
    },
    [spaceId, channelId, api, isEncrypted, spaceCipher],
  );

  return {
    replyContext,
    setReplyContext,
    editingMessage,
    setEditingMessage,
    handleReply,
    handleStartEdit,
    handleDeleteMessage,
    editingInitialPlaintext,
    editingInitialAttachments,
    loadEditHistory,
  };
}
