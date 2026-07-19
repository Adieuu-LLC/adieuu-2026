import { useCallback, type Dispatch, type SetStateAction, type MutableRefObject, type RefObject } from 'react';
import type { TFunction } from 'i18next';
import { convertShortcodes } from '../../utils/emojiShortcodes';
import {
  serializePayload,
  gifPayload,
  buildCustomEmojiPayloadMap,
  type MediaAttachment,
  type MentionEntity,
  type PageTagEntity,
  type GifAttachment,
} from '../../services/messagePayload';
import { getSenderDeviceIdForPayload } from '../../services/deviceInfo';
import type { PublicCustomEmoji } from '@adieuu/shared';
import type { MediaOutboxEnqueueInput } from '../../services/mediaOutbox/mediaOutboxTypes';
import type {
  ComposerSendFn,
  ComposerReplyContext,
  MentionSource,
  PendingAttachment,
  TrackedMention,
  TrackedPageTag,
} from './composerTypes';
import { resolveMentionedIdentityIds } from './composerUtils';

export interface UseComposerSendParams {
  disabled?: boolean;
  channelId: string;
  sending: boolean;
  onSend: ComposerSendFn;
  onSendSucceeded?: () => void;
  forwardSecrecy?: { enabled: boolean; onToggle: () => void };
  replyContext?: ComposerReplyContext | null;
  editContext?: { messageId: string; clientMessageId?: string; onCancel: () => void } | null;
  editingInitialAttachments?: { media: MediaAttachment[]; gifs: GifAttachment[] };
  ttlSeconds?: number;
  mentionSource?: MentionSource;
  customEmojis?: PublicCustomEmoji[];
  customEmojisDisabled?: boolean;
  attachments: PendingAttachment[];
  pendingGif: GifAttachment | null;
  stripExif: boolean;
  moderationEnabled: boolean;
  sendMp4WithoutReencode: boolean;
  allVideosAreMp4: boolean;
  enqueueMediaSend: (input: MediaOutboxEnqueueInput) => Promise<string>;
  klipyShare: (params: { slug: string; type: GifAttachment['type']; searchTerm?: string }) => void;
  toastError: (title: string, description?: string) => void;
  t: TFunction;
  messageTextRef: MutableRefObject<string>;
  mentionEntriesRef: MutableRefObject<TrackedMention[]>;
  pageTagEntriesRef: MutableRefObject<TrackedPageTag[]>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  setMessageText: (next: string, cursor?: number) => void;
  setPendingGif: Dispatch<SetStateAction<GifAttachment | null>>;
  setAttachments: Dispatch<SetStateAction<PendingAttachment[]>>;
  setSendMp4WithoutReencode: Dispatch<SetStateAction<boolean>>;
  /** Reset undo/redo stacks after a successful text send. */
  resetHistory: () => void;
}

/**
 * The composer's full send pipeline: gif-only sends, edit-mode media/text sends,
 * new media sends via the media outbox, and plain text sends. The logic is moved
 * verbatim from MessageComposer to preserve behavior exactly.
 */
export function useComposerSend(params: UseComposerSendParams): () => Promise<void> {
  const {
    disabled,
    channelId,
    sending,
    onSend,
    onSendSucceeded,
    forwardSecrecy,
    replyContext,
    editContext,
    editingInitialAttachments,
    ttlSeconds,
    mentionSource,
    customEmojis,
    customEmojisDisabled,
    attachments,
    pendingGif,
    stripExif,
    moderationEnabled,
    sendMp4WithoutReencode,
    allVideosAreMp4,
    enqueueMediaSend,
    klipyShare,
    toastError,
    t,
    messageTextRef,
    mentionEntriesRef,
    pageTagEntriesRef,
    inputRef,
    setMessageText,
    setPendingGif,
    setAttachments,
    setSendMp4WithoutReencode,
    resetHistory,
  } = params;

  return useCallback(async () => {
    if (disabled) return;
    const text = messageTextRef.current.trim();
    if (!channelId || (!text && attachments.length === 0 && !pendingGif) || sending) return;


    const currentPendingGif = pendingGif;
    const pendingAttachments = [...attachments];
    const currentMentions = [...mentionEntriesRef.current];
    const currentPageTags = [...pageTagEntriesRef.current];
    setMessageText('');
    setPendingGif(null);
    mentionEntriesRef.current = [];
    pageTagEntriesRef.current = [];
    resetHistory();

    if (currentPendingGif) {
      const convertedText = convertShortcodes(text) || undefined;
      const payload = gifPayload(convertedText, currentPendingGif);
      const customEmojiMap = buildCustomEmojiPayloadMap(
        convertedText ?? '',
        customEmojis,
        customEmojisDisabled === true,
      );
      if (customEmojiMap && Object.keys(customEmojiMap).length > 0) {
        payload.customEmojis = customEmojiMap;
      }
      const mentions: MentionEntity[] = currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }));
      if (mentions.length > 0) payload.mentions = mentions;
      const pageTags: PageTagEntity[] = currentPageTags.map((p) => ({ id: p.pageId, offset: p.offset, length: p.length }));
      if (pageTags.length > 0) payload.pageTags = pageTags;
      const gifSenderDeviceId = getSenderDeviceIdForPayload();
      if (gifSenderDeviceId) payload.senderDeviceId = gifSenderDeviceId;
      const plaintext = serializePayload(payload);

      const mentionedIdentityIds = resolveMentionedIdentityIds(mentions, mentionSource);

      if (!editContext) {
        klipyShare({
          slug: currentPendingGif.slug,
          type: currentPendingGif.type,
          searchTerm: currentPendingGif.searchTerm || undefined,
        });
      }

      const sent = await onSend(plaintext, {
        ...(forwardSecrecy?.enabled ? { useForwardSecrecy: true } : {}),
        ...(replyContext ? { replyToMessageId: replyContext.messageId } : {}),
        ...(ttlSeconds ? { expiresInSeconds: ttlSeconds } : {}),
        mentionedIdentityIds,
      });
      replyContext?.onCancel();
      if (sent != null) {
        onSendSucceeded?.();
      }
      inputRef.current?.focus();
      return;
    }

    if (pendingAttachments.length > 0 && editContext) {
      const existingAtts = pendingAttachments.filter((a) => a.existingMediaId);
      const newAtts = pendingAttachments.filter((a) => !a.existingMediaId);
      const existingE2eMediaIds = existingAtts.map((a) => a.existingMediaId!);

      if (newAtts.length > 0) {
        try {
          await enqueueMediaSend({
            conversationId: channelId,
            caption: text,
            mentions: currentMentions,
            pageTags: currentPageTags,
            useForwardSecrecy: forwardSecrecy?.enabled ?? false,
            stripExif,
            moderationEnabled,
            ...(sendMp4WithoutReencode && allVideosAreMp4 ? { sendMp4WithoutReencode: true } : {}),
            ...(customEmojis?.length && !customEmojisDisabled
              ? { composerCustomEmojisSnapshotJson: JSON.stringify(customEmojis) }
              : {}),
            files: newAtts.map((a) => a.file),
            editMessageId: editContext.messageId,
            ...(editContext.clientMessageId
              ? { editClientMessageId: editContext.clientMessageId }
              : {}),
            existingE2eMediaIds,
          });
        } catch (err) {
          console.error('[Composer] Media outbox edit enqueue failed:', err);
          toastError(
            t('conversations.uploadFailed', 'Upload failed'),
            err instanceof Error ? err.message : t('conversations.uploadFailedDesc', 'One or more attachments could not be uploaded.'),
          );
          return;
        }
      } else {
        const convertedText = convertShortcodes(text);
        const mentions: MentionEntity[] = currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }));
        const pageTags: PageTagEntity[] = currentPageTags.map((p) => ({ id: p.pageId, offset: p.offset, length: p.length }));
        const senderDeviceId = getSenderDeviceIdForPayload();
        const customEmojiMap = buildCustomEmojiPayloadMap(convertedText, customEmojis, customEmojisDisabled === true);
        const plaintext = serializePayload({
          version: 1,
          text: convertedText,
          ...(mentions.length > 0 ? { mentions } : {}),
          ...(pageTags.length > 0 ? { pageTags } : {}),
          ...(customEmojiMap ? { customEmojis: customEmojiMap } : {}),
          ...(editingInitialAttachments?.media.filter((a) => existingE2eMediaIds.includes(a.e2eMediaId)).length
            ? { attachments: editingInitialAttachments.media.filter((a) => existingE2eMediaIds.includes(a.e2eMediaId)) }
            : {}),
          ...(senderDeviceId ? { senderDeviceId } : {}),
        });
        const sent = await onSend(plaintext, {
          ...(forwardSecrecy?.enabled ? { useForwardSecrecy: true } : {}),
          e2eMediaIds: existingE2eMediaIds,
        });
        if (sent != null) {
          onSendSucceeded?.();
        }
      }

      setSendMp4WithoutReencode(false);
      setAttachments((prev) => {
        for (const a of prev) {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
        return [];
      });
      inputRef.current?.focus();
    } else if (pendingAttachments.length > 0) {
      try {
        await enqueueMediaSend({
          conversationId: channelId,
          caption: text,
          mentions: currentMentions,
          pageTags: currentPageTags,
          mentionedIdentityIds: resolveMentionedIdentityIds(
            currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length })),
            mentionSource,
          ),
          replyToMessageId: replyContext?.messageId,
          ttlSeconds,
          useForwardSecrecy: forwardSecrecy?.enabled ?? false,
          stripExif,
          moderationEnabled,
          ...(sendMp4WithoutReencode && allVideosAreMp4 ? { sendMp4WithoutReencode: true } : {}),
          ...(customEmojis?.length && !customEmojisDisabled
            ? { composerCustomEmojisSnapshotJson: JSON.stringify(customEmojis) }
            : {}),
          files: pendingAttachments.map((a) => a.file),
        });
      } catch (err) {
        console.error('[Composer] Media outbox enqueue failed:', err);
        toastError(
          t('conversations.uploadFailed', 'Upload failed'),
          err instanceof Error ? err.message : t('conversations.uploadFailedDesc', 'One or more attachments could not be uploaded.'),
        );
        return;
      }

      replyContext?.onCancel();
      setSendMp4WithoutReencode(false);
      setAttachments((prev) => {
        for (const a of prev) URL.revokeObjectURL(a.previewUrl);
        return [];
      });
      inputRef.current?.focus();
    } else {
      const convertedText = convertShortcodes(text);
      const mentions: MentionEntity[] = currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }));
      const pageTags: PageTagEntity[] = currentPageTags.map((p) => ({ id: p.pageId, offset: p.offset, length: p.length }));
      const mentionedIdentityIds = resolveMentionedIdentityIds(mentions, mentionSource);
      const senderDeviceId = getSenderDeviceIdForPayload();

      const customEmojiMap = buildCustomEmojiPayloadMap(
        convertedText,
        customEmojis,
        customEmojisDisabled === true,
      );

      const plaintext = serializePayload({
        version: 1,
        text: convertedText,
        ...(mentions.length > 0 ? { mentions } : {}),
        ...(pageTags.length > 0 ? { pageTags } : {}),
        ...(customEmojiMap ? { customEmojis: customEmojiMap } : {}),
        ...(senderDeviceId ? { senderDeviceId } : {}),
      });
      if (editContext) {
        const sent = await onSend(plaintext, {
          ...(forwardSecrecy?.enabled ? { useForwardSecrecy: true } : {}),
        });
        if (sent != null) {
          onSendSucceeded?.();
        }
        inputRef.current?.focus();
      } else {
        const sent = await onSend(plaintext, {
          ...(forwardSecrecy?.enabled ? { useForwardSecrecy: true } : {}),
          ...(replyContext ? { replyToMessageId: replyContext.messageId } : {}),
          ...(ttlSeconds ? { expiresInSeconds: ttlSeconds } : {}),
          mentionedIdentityIds,
        });
        replyContext?.onCancel();
        if (sent != null) {
          onSendSucceeded?.();
        }
        inputRef.current?.focus();
      }
    }
  }, [
    disabled,
    channelId,
    sending,
    onSend,
    forwardSecrecy,
    replyContext,
    editContext,
    onSendSucceeded,
    attachments,
    pendingGif,
    stripExif,
    moderationEnabled,
    sendMp4WithoutReencode,
    allVideosAreMp4,
    klipyShare,
    toastError,
    t,
    ttlSeconds,
    enqueueMediaSend,
    customEmojis,
    customEmojisDisabled,
    mentionSource,
    editingInitialAttachments,
    messageTextRef,
    mentionEntriesRef,
    pageTagEntriesRef,
    inputRef,
    setMessageText,
    setPendingGif,
    setAttachments,
    setSendMp4WithoutReencode,
    resetHistory,
  ]);
}
