/**
 * Conversation main panel: the message-body region between the toolbar and the
 * sidebars. Renders the drag-and-drop overlay, the message list, the
 * key-change / blocked banners, and the message composer.
 *
 * Purely presentational — it receives the conversation's coordinated state via
 * grouped hook results from {@link ConversationView}.
 */

import { memo, useCallback, useMemo, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type { PublicCustomEmoji, PublicIdentity } from '@adieuu/shared';
import { Icon } from '../../icons/Icon';
import { Button } from '../../components/Button';
import { MessageComposer, type MessageComposerHandle } from '../../components/composer';
import type { ComposerSendFn, ComposerReplyContext, MentionSource, PageTagSource } from '../../components/composer';
import type { MediaAttachment, GifAttachment } from '../../services/messagePayload';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { GroupedReaction, ReactionCustomEmoji } from '../../hooks/useReactions';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import type { useConversationScroll } from '../../hooks/useConversationScroll';
import type { useConversationScrollOrchestration } from '../../hooks/conversations/useConversationScrollOrchestration';
import type { useConversationComposerAdapter } from '../../hooks/conversations/useConversationComposerAdapter';
import type { useConversationMessageActions } from '../../hooks/conversations/useConversationMessageActions';
import type { useConversationSecurityState } from '../../hooks/conversations/useConversationSecurityState';
import type { useConversationPreferences } from '../../hooks/conversations/useConversationPreferences';
import type { useConversationFileDrop } from '../../hooks/conversations/useConversationFileDrop';
import type { DecryptedConversation } from '../../hooks/conversations/types';
import { ConversationMessageList } from './ConversationMessageList';
import type { ChatItem } from './conversationUtils';
import { resolveDisplayName } from './conversationUtils';

type IdentityLike = { id: string; avatarUrl?: string; displayName?: string; username?: string } | null | undefined;

type ConversationComposerIslandProps = {
  composerRef: React.Ref<MessageComposerHandle>;
  conversationId: string;
  sending: boolean;
  onSend: ComposerSendFn;
  forwardSecrecyEnabled: boolean;
  onToggleForwardSecrecy: () => void;
  replyContext: ComposerReplyContext | null;
  mentionSource: MentionSource | undefined;
  pageTagSource: PageTagSource | undefined;
  placeholderTarget: string;
  mentionInsertRef: React.MutableRefObject<((identityId: string) => void) | null>;
  gifsDisabled: boolean;
  lastMessageText: string | undefined;
  disabled: boolean;
  customEmojis: PublicCustomEmoji[];
  customEmojisDisabled: boolean;
  editingMessage: DisplayMessage | null;
  onCancelEdit: () => void;
  editingInitialPlaintext: string;
  editingInitialAttachments: { media: MediaAttachment[]; gifs: GifAttachment[] } | undefined;
  allowSkipModeration: boolean;
};

const ConversationComposerIsland = memo(function ConversationComposerIsland({
  composerRef,
  conversationId,
  sending,
  onSend,
  forwardSecrecyEnabled,
  onToggleForwardSecrecy,
  replyContext,
  mentionSource,
  pageTagSource,
  placeholderTarget,
  mentionInsertRef,
  gifsDisabled,
  lastMessageText,
  disabled,
  customEmojis,
  customEmojisDisabled,
  editingMessage,
  onCancelEdit,
  editingInitialPlaintext,
  editingInitialAttachments,
  allowSkipModeration,
}: ConversationComposerIslandProps) {
  const forwardSecrecy = useMemo(
    () => ({ enabled: forwardSecrecyEnabled, onToggle: onToggleForwardSecrecy }),
    [forwardSecrecyEnabled, onToggleForwardSecrecy],
  );
  const editContext = useMemo(
    () =>
      editingMessage
        ? {
            messageId: editingMessage.id,
            clientMessageId: editingMessage.clientMessageId,
            onCancel: onCancelEdit,
          }
        : null,
    [editingMessage, onCancelEdit],
  );

  return (
    <MessageComposer
      ref={composerRef}
      channelId={conversationId}
      sending={sending}
      onSend={onSend}
      forwardSecrecy={forwardSecrecy}
      replyContext={editingMessage ? null : replyContext}
      mentionSource={mentionSource}
      pageTagSource={pageTagSource}
      placeholderTarget={placeholderTarget}
      mentionInsertRef={mentionInsertRef}
      gifsDisabled={gifsDisabled}
      lastMessageText={lastMessageText}
      disabled={disabled}
      customEmojis={customEmojis}
      customEmojisDisabled={customEmojisDisabled}
      editContext={editContext}
      editingMessageKey={editingMessage?.id ?? null}
      editingInitialPlaintext={editingInitialPlaintext}
      editingInitialAttachments={editingInitialAttachments}
      allowSkipModeration={allowSkipModeration}
    />
  );
});

export interface ConversationMainPanelProps {
  conversationId: string;
  activeConversationId: string | null;
  conversation: DecryptedConversation;
  identity: IdentityLike;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  displayName: string;

  flatItems: ChatItem[];
  messagesLoading: boolean;
  reversedMessagesLength: number;
  messagesById: Map<string, DisplayMessage>;
  unreadCount: number;
  fsInfo: { rotationLabel: string; readableWindow: string; tooltip: string };
  lastMessageText: string | undefined;

  messageLayout: 'linear' | 'bubble';
  memberColorDisplay: MemberColorDisplay;
  favoriteEmojis: string[];
  customEmojis: PublicCustomEmoji[];
  isFreeTier: boolean;

  hasMoreOlder: boolean;
  hasNewerPages: boolean;
  showManualLoadOlder: boolean;
  showManualLoadNewer: boolean;
  onManualLoadOlder: () => void;
  onManualLoadNewer: () => void;
  canManagePins: boolean;

  sending: boolean;
  composerRef: React.Ref<MessageComposerHandle>;
  mentionInsertRef: React.MutableRefObject<((identityId: string) => void) | null>;

  isDmBlocked: boolean;
  blockedByOther: boolean;
  otherParticipants: string[];
  onUnblock: (identityId: string) => Promise<{ success: boolean; error?: string }>;
  onUnblockSuccess: () => void;
  onUnblockError: (message: string) => void;

  getGroupedReactions: (messageId: string) => GroupedReaction[];
  onReact: (messageId: string, emoji: string, customEmoji?: ReactionCustomEmoji) => void;
  onToggleReaction: (
    messageId: string,
    emoji: string,
    ownReactionId?: string,
    customEmoji?: ReactionCustomEmoji,
  ) => void;
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  onMentionClick: (identityId: string) => void;
  onLinkClick: (href: string) => void;

  t: TFunction;

  scroll: ReturnType<typeof useConversationScroll>;
  scrollOrchestration: ReturnType<typeof useConversationScrollOrchestration>;
  fileDrop: ReturnType<typeof useConversationFileDrop>;
  messageActions: ReturnType<typeof useConversationMessageActions>;
  security: ReturnType<typeof useConversationSecurityState>;
  prefs: ReturnType<typeof useConversationPreferences>;
  composerAdapter: ReturnType<typeof useConversationComposerAdapter>;
}

export function ConversationMainPanel(props: ConversationMainPanelProps): ReactNode {
  const {
    conversationId,
    activeConversationId,
    conversation,
    identity,
    participantProfiles,
    memberSettings,
    displayName,
    flatItems,
    messagesLoading,
    reversedMessagesLength,
    messagesById,
    unreadCount,
    fsInfo,
    lastMessageText,
    messageLayout,
    memberColorDisplay,
    favoriteEmojis,
    customEmojis,
    isFreeTier,
    hasMoreOlder,
    hasNewerPages,
    showManualLoadOlder,
    showManualLoadNewer,
    onManualLoadOlder,
    onManualLoadNewer,
    canManagePins,
    sending,
    composerRef,
    mentionInsertRef,
    isDmBlocked,
    blockedByOther,
    otherParticipants,
    onUnblock,
    onUnblockSuccess,
    onUnblockError,
    getGroupedReactions,
    onReact,
    onToggleReaction,
    onAddFavorite,
    onRemoveFavorite,
    onMentionClick,
    onLinkClick,
    t,
    scroll,
    scrollOrchestration,
    fileDrop,
    messageActions,
    security,
    prefs,
    composerAdapter,
  } = props;

  const { keyChangeAlertIdentityIds, keyChangeAlertDismissed } = security;
  const { editingMessage, setEditingMessage } = messageActions;
  const handleCancelEdit = useCallback(
    () => setEditingMessage(null),
    [setEditingMessage],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop event delegation for file attachment
    <div
      className="conversation-main conversation-main-drop-target"
      onDragEnter={fileDrop.handleConversationDragEnter}
      onDragLeave={fileDrop.handleConversationDragLeave}
      onDragOver={fileDrop.handleConversationDragOver}
      onDrop={fileDrop.handleConversationDrop}
    >
        {fileDrop.conversationDropActive ? (
          <div className="conversation-main-drop-overlay" aria-hidden>
            <Icon name="upload" className="conversation-main-drop-overlay__icon" />
            <span className="conversation-main-drop-overlay__title">
              {t('conversations.dropFilesToAttach', 'Drop to attach')}
            </span>
            <span className="conversation-main-drop-overlay__hint">
              {t('conversations.dropFilesToAttachHint', 'Images and videos you can send in chat')}
            </span>
          </div>
        ) : null}
        <ConversationMessageList
          conversationId={conversationId}
          activeConversationId={activeConversationId}
          flatItems={flatItems}
          messagesLoading={messagesLoading}
          reversedMessagesLength={reversedMessagesLength}
          messagesById={messagesById}
          identity={identity}
          participantProfiles={participantProfiles}
          memberSettings={memberSettings}
          messageLayout={messageLayout}
          memberColorDisplay={memberColorDisplay}
          favoriteEmojis={favoriteEmojis}
          fsInfo={fsInfo}
          flashingMessageId={messageActions.flashingMessageId}
          getGroupedReactions={getGroupedReactions}
          onDeleteMessage={messageActions.handleDeleteMessage}
          onReact={onReact}
          onToggleReaction={onToggleReaction}
          onReportMessage={messageActions.handleReportMessage}
          onAddFavorite={onAddFavorite}
          onRemoveFavorite={onRemoveFavorite}
          onReply={messageActions.setReplyingTo}
          onStartEdit={messageActions.handleStartEdit}
          onLinkClick={onLinkClick}
          onMentionClick={onMentionClick}
          scrollToMessageId={scrollOrchestration.scrollToMessageId}
          showScrollButton={scroll.showScrollButton}
          unreadCount={unreadCount}
          onJumpToLatest={scrollOrchestration.handleJumpToLatest}
          scrollViewportRef={scroll.scrollViewportRef}
          messagesContentRef={scroll.messagesContentRef}
          messagesContainerRef={scroll.messagesContainerRef}
          onScrollViewportScroll={scroll.onScrollViewportScroll}
          onUserScrollIntent={scroll.onUserScrollIntent}
          cachedScrollIndex={scroll.cachedScrollIndex}
          hasMoreOlder={hasMoreOlder}
          onReachOlder={scrollOrchestration.handleReachOlder}
          hasNewerPages={hasNewerPages}
          onReachNewer={scrollOrchestration.handleReachNewer}
          showManualLoadOlder={showManualLoadOlder}
          showManualLoadNewer={showManualLoadNewer}
          onManualLoadOlder={onManualLoadOlder}
          onManualLoadNewer={onManualLoadNewer}
          t={t as unknown as (key: string, fallback: string) => string}
          gifsDisabledByAdmin={conversation.gifsDisabled ?? false}
          customEmojisDisabledByAdmin={conversation.customEmojisDisabled === true}
          pinnedMessageIds={conversation.pinnedMessageIds ?? []}
          canManagePins={canManagePins}
          onPinMessage={messageActions.handlePinMessage}
          onUnpinMessage={messageActions.handleUnpinMessage}
          onOpenMemberSecurity={security.openMemberSecurity}
          onDeviceTrustMismatch={security.handleDeviceTrustMismatch}
          peerPublicKeysById={security.peerPublicKeysById}
          verificationRevision={security.verificationRevision}
          customEmojis={customEmojis}
          isFreeTier={isFreeTier}
        />

        {keyChangeAlertIdentityIds.length > 0 && !keyChangeAlertDismissed && (
          <div className="key-change-alert-banner" role="alert">
            <Icon name="error" />
            <span>
              {t(
                'conversations.memberSecurity.keyChangeBanner',
                '{{names}} may have changed devices or keys. Review their device fingerprints before sharing sensitive information.',
                {
                  names: keyChangeAlertIdentityIds
                    .map((pid) =>
                      resolveDisplayName(pid, participantProfiles, memberSettings, identity?.id, t),
                    )
                    .join(', '),
                },
              )}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const firstId = keyChangeAlertIdentityIds[0]!;
                security.openMemberSecurity(
                  firstId,
                  resolveDisplayName(firstId, participantProfiles, memberSettings, identity?.id, t),
                );
              }}
            >
              {t('conversations.memberSecurity.reviewFingerprints', 'Review')}
            </Button>
            <button
              type="button"
              className="key-change-alert-banner__dismiss"
              onClick={() => security.setKeyChangeAlertDismissed(true)}
              aria-label={t('common.dismiss', 'Dismiss')}
            >
              <Icon name="x" />
            </button>
          </div>
        )}

        {isDmBlocked && (
          <div className="blocked-conversation-banner">
            <Icon name="ban" />
            <span>{t('blocked.blockedBanner')}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const result = await onUnblock(otherParticipants[0]!);
                if (result.success) {
                  onUnblockSuccess();
                } else {
                  onUnblockError(result.error ?? t('blocked.unblock'));
                }
              }}
            >
              {t('blocked.unblock')}
            </Button>
          </div>
        )}
        {blockedByOther && !isDmBlocked && (
          <div className="blocked-conversation-banner">
            <Icon name="ban" />
            <span>{t('blocked.blockedByOtherBanner')}</span>
          </div>
        )}
        <ConversationComposerIsland
          composerRef={composerRef}
          conversationId={conversationId}
          sending={sending}
          onSend={composerAdapter.composerSend}
          forwardSecrecyEnabled={prefs.useFs}
          onToggleForwardSecrecy={prefs.handleToggleFs}
          replyContext={composerAdapter.composerReplyContext}
          mentionSource={composerAdapter.composerMentionSource}
          pageTagSource={composerAdapter.composerPageTagSource}
          placeholderTarget={displayName}
          mentionInsertRef={mentionInsertRef}
          gifsDisabled={
            (conversation.gifsDisabled ?? false) || prefs.convGifHidden || prefs.gifsGloballyDisabled
          }
          lastMessageText={lastMessageText}
          disabled={isDmBlocked || blockedByOther}
          customEmojis={customEmojis}
          customEmojisDisabled={conversation.customEmojisDisabled === true}
          editingMessage={editingMessage}
          onCancelEdit={handleCancelEdit}
          editingInitialPlaintext={messageActions.editingInitialPlaintext}
          editingInitialAttachments={messageActions.editingInitialAttachments}
          allowSkipModeration={conversation.allowSkipModeration === true}
        />
    </div>
  );
}
