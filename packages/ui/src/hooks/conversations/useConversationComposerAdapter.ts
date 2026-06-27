import { useCallback, useMemo, type MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import type { PublicIdentity } from '@adieuu/shared';
import type { ComposerSendFn, ComposerReplyContext, MentionSource, MentionableUser, PageTagSource } from '../../components/composer';
import { clearConversationScrollCache } from '../useConversationScroll';
import type { DisplayMessage } from '../useConversations';
import type { DecryptedConversation } from './types';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import {
  resolveDisplayName,
  buildReplySnippet,
} from '../../pages/conversations/conversationUtils';
import { useTaggablePages, getTaggablePage } from '../../navigation/taggablePages';

export function useConversationComposerAdapter(params: {
  conversationId: string | undefined;
  identityId: string | undefined;
  conversation: DecryptedConversation | undefined;
  activeMessagesRef: MutableRefObject<DisplayMessage[]>;
  conversationRef: MutableRefObject<DecryptedConversation | undefined>;
  activeMessagesHasNewerPages: boolean;
  sendTextMessage: (
    id: string,
    plaintext: string,
    options: { skipMessageStateUpdate?: boolean } & Record<string, unknown>,
  ) => Promise<unknown>;
  checkMessageAchievements: (plaintext: string) => void;
  jumpToLatestMessages: (id: string) => Promise<unknown>;
  scrollToBottom: (behavior: 'smooth' | 'auto') => void;
  markJustSent: () => void;
  setIsAtBottom: (v: boolean) => void;
  setBlockedByOther: (v: boolean) => void;
  replyingTo: DisplayMessage | null;
  setReplyingTo: (v: DisplayMessage | null) => void;
  editingMessage: DisplayMessage | null;
  setEditingMessage: (v: DisplayMessage | null) => void;
  editTextMessage: (
    convId: string,
    messageId: string,
    plaintext: string,
    options?: { useForwardSecrecy?: boolean }
  ) => Promise<unknown>;
  onEditMaxReached: () => void;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  t: TFunction;
  scrollToMessageId: (id: string) => void;
}) {
  const {
    conversationId,
    identityId,
    conversation,
    activeMessagesRef,
    conversationRef,
    activeMessagesHasNewerPages,
    sendTextMessage,
    checkMessageAchievements,
    jumpToLatestMessages,
    scrollToBottom,
    markJustSent,
    setIsAtBottom,
    setBlockedByOther,
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,
    editTextMessage,
    onEditMaxReached,
    participantProfiles,
    memberSettings,
    t,
    scrollToMessageId,
  } = params;

  const composerSend: ComposerSendFn = useCallback(
    async (plaintext, options) => {
      if (!conversationId) return null;
      if (editingMessage) {
        const r = await editTextMessage(conversationId, editingMessage.id, plaintext, {
          useForwardSecrecy: options?.useForwardSecrecy,
        });
        if (r != null && typeof r === 'object' && 'errorCode' in r) {
          if ((r as { errorCode: string }).errorCode === 'MAX_EDITS_REACHED') {
            onEditMaxReached();
          }
        } else if (r != null && typeof r === 'object' && !('errorCode' in r)) {
          setEditingMessage(null);
        }
        return r;
      }
      const hadNewerPages = activeMessagesHasNewerPages;
      const headBefore = activeMessagesRef.current[0]?.id;
      const lastBefore = conversationRef.current?.lastMessageId;
      const atLiveTailBefore =
        !hadNewerPages &&
        (lastBefore == null ? headBefore == null : headBefore === lastBefore);

      const result = await sendTextMessage(conversationId, plaintext, {
        ...options,
        skipMessageStateUpdate: !atLiveTailBefore,
      });
      if (
        result != null &&
        typeof result === 'object' &&
        'errorCode' in result &&
        result.errorCode === 'BLOCKED'
      ) {
        setBlockedByOther(true);
        return null;
      }
      if (result != null && typeof result === 'object' && !('errorCode' in result)) {
        checkMessageAchievements(plaintext);
        if (!atLiveTailBefore) {
          clearConversationScrollCache(conversationId);
          setIsAtBottom(true);
          await jumpToLatestMessages(conversationId);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => scrollToBottom('smooth'));
          });
        } else {
          markJustSent();
        }
      }
      return result;
    },
    [
      conversationId,
      editingMessage,
      editTextMessage,
      setEditingMessage,
      onEditMaxReached,
      sendTextMessage,
      checkMessageAchievements,
      activeMessagesHasNewerPages,
      jumpToLatestMessages,
      scrollToBottom,
      markJustSent,
      setIsAtBottom,
      setBlockedByOther,
      activeMessagesRef,
      conversationRef,
    ]
  );

  const composerReplyContext: ComposerReplyContext | null = useMemo(() => {
    if (!replyingTo) return null;
    return {
      messageId: replyingTo.id,
      authorName: resolveDisplayName(replyingTo.fromIdentityId, participantProfiles, memberSettings),
      snippet: buildReplySnippet(replyingTo, t),
      onCancel: () => setReplyingTo(null),
      onClick: () => scrollToMessageId(replyingTo.id),
    };
  }, [replyingTo, participantProfiles, memberSettings, t, scrollToMessageId, setReplyingTo]);

  const composerMentionSource: MentionSource | undefined = useMemo(() => {
    if (!conversation) return undefined;
    const users: MentionableUser[] = conversation.participants
      .filter((pid) => pid !== identityId)
      .map((pid) => {
        const profile = participantProfiles[pid];
        const nickname = memberSettings[pid]?.nickname;
        return {
          id: pid,
          displayName: nickname || profile?.displayName || profile?.username || pid.slice(0, 8),
          username: profile?.username,
          avatarUrl: profile?.avatarUrl,
        };
      });
    return {
      users,
      isGroup: conversation.type === 'group',
      resolveMentionDisplay: (uid: string) => {
        const nickname = memberSettings[uid]?.nickname;
        if (nickname) return nickname;
        const profile = participantProfiles[uid];
        return profile?.displayName || profile?.username || uid.slice(0, 8);
      },
    };
  }, [conversation, identityId, participantProfiles, memberSettings]);

  const { accessiblePages } = useTaggablePages();

  const composerPageTagSource: PageTagSource | undefined = useMemo(() => {
    if (accessiblePages.length === 0) return undefined;
    return {
      pages: accessiblePages.map((p) => ({
        id: p.id,
        labelDefault: p.labelDefault,
        icon: p.icon,
        aliases: p.aliases,
      })),
      resolvePageDisplay: (pageId: string) => {
        const page = getTaggablePage(pageId);
        return page?.labelDefault ?? pageId;
      },
    };
  }, [accessiblePages]);

  return { composerSend, composerReplyContext, composerMentionSource, composerPageTagSource };
}
