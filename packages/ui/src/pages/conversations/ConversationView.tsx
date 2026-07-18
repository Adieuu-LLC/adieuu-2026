/**
 * Conversation View Page — composition root that wires the extracted feature
 * hooks (call, security, admin settings, preferences, dialogs, message actions,
 * file drop, search) and orchestration to the presentational sub-components.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations } from '../../hooks/useConversations';
import { useConversationScroll } from '../../hooks/useConversationScroll';
import { useViewportReactionFetch } from '../../hooks/useViewportReactionFetch';
import { useIdentity } from '../../hooks/useIdentity';
import { useAuth } from '../../hooks/useAuth';
import { useCustomEmojis } from '../../hooks/useCustomEmojis';
import { usePreKeys } from '../../hooks/usePreKeys';
import { useReactions } from '../../hooks/useReactions';
import { useFavoriteEmojis } from '../../hooks/useFavoriteEmojis';
import { loadShowMessageArtifacts } from '../../services/preKeyService';
import { useAppConfig } from '../../config/PlatformContext';
import { useMessageLayoutPreference } from '../../hooks/useMessageLayoutPreference';
import { useMemberColorPreference } from '../../hooks/useMemberColorPreference';
import { clearMediaCache } from '../../hooks/useE2EMediaDownload';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useMessageAchievements } from '../../hooks/useMessageAchievements';
import type { MessageComposerHandle } from '../../components/composer';
import { useBlockContext } from '../../hooks/useBlockContext';
import { Icon } from '../../icons/Icon';
import { useToast } from '../../components/Toast';
import { useConversationPendingInvites } from '../../hooks/conversations/useConversationPendingInvites';
import { useDmBlockedByOther } from '../../hooks/conversations/useDmBlockedByOther';
import { useConversationReactionHandlers } from '../../hooks/conversations/useConversationReactionHandlers';
import { useConversationComposerAdapter } from '../../hooks/conversations/useConversationComposerAdapter';
import { useConversationScrollOrchestration } from '../../hooks/conversations/useConversationScrollOrchestration';
import { useConversationCallState } from '../../hooks/conversations/useConversationCallState';
import { useConversationSecurityState } from '../../hooks/conversations/useConversationSecurityState';
import { useConversationAdminSettings } from '../../hooks/conversations/useConversationAdminSettings';
import { useConversationPreferences } from '../../hooks/conversations/useConversationPreferences';
import { useConversationDialogState } from '../../hooks/conversations/useConversationDialogState';
import { useConversationMessageActions } from '../../hooks/conversations/useConversationMessageActions';
import { useConversationFileDrop } from '../../hooks/conversations/useConversationFileDrop';
import {
  useConversationMessageSearchSession,
  type ConversationPane,
} from '../../hooks/conversations/useConversationMessageSearchSession';
import {
  buildFlatChatItems,
  buildMessagesByIdMap,
  canManageConversationPinsView,
  formatPinPreviewForToolbar,
  getConversationHeaderCopy,
  getLastMessagePreviewText,
  getReversedVisibleMessages,
  getToolbarAvatarMemberIds,
  mergePendingOutboxIntoFlatItems,
  resolveToolbarParticipantName,
} from './conversationViewModel';
import { useMediaOutbox, useMediaOutboxJobList } from '../../services/mediaOutbox';
import { buildForwardSecrecyUiLabels } from './forwardSecrecyLabels';
import { useMessageSearchCacheMode } from '../../hooks/useMessageSearchPreferences';
import { ConversationHeader } from './ConversationHeader';
import { ConversationMainPanel } from './ConversationMainPanel';
import { ConversationSidebars } from './ConversationSidebars';
import { ConversationCallSection } from './ConversationCallSection';
import { ConversationOverlays } from './ConversationOverlays';

export function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identity } = useIdentity();
  const { session } = useAuth();
  const isFreeTier = useMemo(() => {
    if (!session) return false;
    if (session.isLifetime) return false;
    if ((session.subscriptions ?? []).some((t_) => t_ === 'access' || t_ === 'insider')) return false;
    if ((session.entitlements ?? []).includes('gifted')) return false;
    return true;
  }, [session]);
  const { emojis: composerCustomEmojis } = useCustomEmojis(identity?.id);
  const { config: fsConfig } = usePreKeys();
  const {
    conversations,
    activeConversationId,
    activeMessages,
    activeMessagesOlderCursor,
    activeMessagesHasNewerPages,
    messagesLoading,
    sending,
    participantProfiles,
    setActiveConversation,
    setIsAtBottom,
    fetchConversationById,
    markConversationRead,
    sendTextMessage,
    editTextMessage,
    loadOlder,
    loadNewer,
    activeShowManualLoadOlder,
    activeShowManualLoadNewer,
    jumpToLatestMessages,
    fetchMessagesAround,
    loadPinnedMessagesPage,
    replyParentHydrationMap,
    ensureReplyParentHydration,
    leaveGroup,
    removeMember,
    promoteToAdmin,
    terminateGroup,
    deleteMessage,
    pinMessage,
    unpinMessage,
    renameGroup,
    updateMemberSettings,
    updateGifsDisabled,
    updateGifContentFilter,
    updateCustomEmojisDisabled,
    updateMessageSearchCachePolicy,
    updateAllowSkipModeration,
    updateCallSettings,
    memberSettings,
    fetchRecipientKeys,
    listPendingGroupInvites,
    revokeGroupInvite,
    pendingInvitesRefreshSignal,
    prefetchParticipantProfiles,
  } = useConversations();

  const messageLayoutKey = `${activeMessages[0]?.id ?? ''}:${activeMessages.length}`;
  const messageLayout = useMessageLayoutPreference();
  const memberColorDisplay = useMemberColorPreference();
  const { isBlocked: checkBlocked, unblock: unblockIdentity } = useBlockContext();
  const toast = useToast();

  const { fetchReactions, addReaction, removeReaction, getGroupedReactions } = useReactions(id ?? null);
  const { favorites: favoriteEmojis, addFavorite, removeFavorite } = useFavoriteEmojis(identity?.id);

  // Shared with useConversationScroll: while a page-anchor restore owns the
  // scroll position, its top-anchor correction stands down so the two do not
  // fight and overshoot.
  const historyAnchorActiveRef = useRef(false);

  const scroll = useConversationScroll({
    conversationId: id,
    setIsAtBottom,
    markConversationRead,
    messageLayoutKey,
    historyAnchorActiveRef,
  });

  const { registerConversationOutboxHooks } = useMediaOutbox();
  const mediaOutboxJobs = useMediaOutboxJobList();

  useEffect(() => {
    if (!id) return;
    registerConversationOutboxHooks(id, {
      markJustSent: scroll.markJustSent,
      scrollToBottom: scroll.scrollToBottom,
    });
    return () => {
      registerConversationOutboxHooks(id, null);
    };
  }, [id, scroll.markJustSent, scroll.scrollToBottom, registerConversationOutboxHooks]);

  useEffect(() => {
    if (!id) return;
    void fetchConversationById(id);
  }, [id, fetchConversationById]);

  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [activePane, setActivePane] = useState<ConversationPane>(null);
  const [mediaOutboxOpen, setMediaOutboxOpen] = useState(false);

  const conversation = conversations.find((c) => c.id === id);

  const selfParticipantJoinedAtMs = useMemo(() => {
    const selfId = identity?.id;
    if (!selfId || !conversation?.participantJoinedAtByIdentityId) return null;
    const iso = conversation.participantJoinedAtByIdentityId[selfId];
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  }, [conversation?.participantJoinedAtByIdentityId, identity?.id]);

  const {
    pendingInvites,
    pendingInvitesLoading,
    refreshPendingInvites,
    handleRevokeInvite,
  } = useConversationPendingInvites({
    conversationId: id,
    conversationType: conversation?.type,
    showMembers: activePane === 'members',
    listPendingGroupInvites,
    revokeGroupInvite,
    prefetchParticipantProfiles,
    pendingInvitesRefreshSignal,
  });

  const { blockedByOther, setBlockedByOther } = useDmBlockedByOther(api, conversation, identity?.id);

  const call = useConversationCallState({ conversationId: id, conversation, apiClient: api.client });
  const security = useConversationSecurityState({
    conversationId: id,
    conversation,
    identityApi: api.identity,
  });
  const adminSettings = useConversationAdminSettings({
    conversationId: id,
    updateGifsDisabled,
    updateGifContentFilter,
    updateCustomEmojisDisabled,
    updateMessageSearchCachePolicy,
    updateAllowSkipModeration,
    updateCallSettings,
  });
  const prefs = useConversationPreferences({
    conversationId: id,
    identityId: identity?.id,
    fsConfigEnabled: fsConfig.enabled,
  });
  const dialogs = useConversationDialogState({
    conversationId: id,
    conversation,
    identityId: identity?.id,
    navigate,
    memberSettings,
    leaveGroup,
    terminateGroup,
    promoteToAdmin,
    removeMember,
    renameGroup,
    updateMemberSettings,
  });
  const messageActions = useConversationMessageActions({
    conversationId: id,
    deleteMessage,
    pinMessage,
    unpinMessage,
  });

  const composerRef = useRef<MessageComposerHandle | null>(null);
  const mentionInsertRef = useRef<((identityId: string) => void) | null>(null);
  const handleMentionClick = useCallback((identityId: string) => {
    mentionInsertRef.current?.(identityId);
  }, []);

  const activeMessagesRef = useRef(activeMessages);
  activeMessagesRef.current = activeMessages;
  const getActiveMessages = useCallback(() => activeMessagesRef.current, []);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const [messageSearchCacheMode] = useMessageSearchCacheMode(identity?.id ?? '');
  const [headlinePinMessageId, setHeadlinePinMessageId] = useState<string | null>(null);

  const search = useConversationMessageSearchSession({
    conversationId: id,
    identityId: identity?.id,
    adminDisallowPersistentCache: conversation?.disallowPersistentMessageSearchCache ?? false,
    activePane,
    setActivePane,
  });

  const showArtifacts = identity ? loadShowMessageArtifacts(identity.id) : false;

  const reversedMessages = useMemo(
    () => getReversedVisibleMessages(activeMessages, showArtifacts),
    [activeMessages, showArtifacts]
  );

  const lastMessageText = useMemo(
    () => getLastMessagePreviewText(activeMessages),
    [activeMessages]
  );

  const {
    handleReact,
    handleToggleReaction,
  } = useConversationReactionHandlers({
    conversationId: id,
    conversation,
    activeMessages,
    addReaction,
    removeReaction,
    fetchRecipientKeys,
    scrollToBottomIfPinned: scroll.scrollToBottomIfPinned,
  });

  useEffect(() => {
    if (id && id !== activeConversationId) {
      setActiveConversation(id);
    }
  }, [id, activeConversationId, setActiveConversation]);

  const setActiveConversationRef = useRef(setActiveConversation);
  setActiveConversationRef.current = setActiveConversation;
  const setIsAtBottomUnmountRef = useRef(setIsAtBottom);
  setIsAtBottomUnmountRef.current = setIsAtBottom;

  useEffect(() => {
    return () => {
      setActiveConversationRef.current(null);
      setIsAtBottomUnmountRef.current(false);
    };
  }, []);

  const fsInfo = useMemo(
    () => buildForwardSecrecyUiLabels(fsConfig),
    [fsConfig.securityLevel, fsConfig.spkDeletionPolicy, fsConfig.clearCacheOnRotation]
  );

  const unreadCount = conversation?.unreadCount ?? 0;

  const messagesById = useMemo(
    () => buildMessagesByIdMap(activeMessages, replyParentHydrationMap),
    [activeMessages, replyParentHydrationMap]
  );

  const headerCopy = useMemo(() => {
    if (!conversation) return null;
    return getConversationHeaderCopy(
      conversation,
      identity?.id,
      participantProfiles,
      memberSettings,
      t
    );
  }, [conversation, identity?.id, participantProfiles, memberSettings, t]);

  const composerInteractionDisabled = useMemo(() => {
    if (!conversation || !headerCopy) return true;
    const { otherParticipantIds: otherParticipants } = headerCopy;
    const dmBlocked =
      conversation.type === 'dm' && otherParticipants.length === 1 && checkBlocked(otherParticipants[0]!);
    return dmBlocked || blockedByOther;
  }, [conversation, headerCopy, checkBlocked, blockedByOther]);

  const fileDrop = useConversationFileDrop({
    conversationId: id,
    composerInteractionDisabled,
    composerRef,
  });

  const toolbarAvatarMembers = useMemo(() => {
    if (!conversation) return [];
    const ids = getToolbarAvatarMemberIds(
      conversation.type,
      conversation.participants,
      identity?.id,
    );
    return ids.map((pid) => ({
      id: pid,
      displayName: resolveToolbarParticipantName(pid, memberSettings, participantProfiles),
      avatarUrl: participantProfiles[pid]?.avatarUrl,
    }));
  }, [conversation, identity?.id, memberSettings, participantProfiles]);

  const pinnedIdsKey = useMemo(
    () => (conversation?.pinnedMessageIds ?? []).join(','),
    [conversation?.pinnedMessageIds]
  );

  useEffect(() => {
    if (!id || !pinnedIdsKey) {
      setHeadlinePinMessageId(null);
      return;
    }
    let cancelled = false;
    void loadPinnedMessagesPage(id, null).then((page) => {
      if (cancelled) return;
      setHeadlinePinMessageId(page?.messages[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id, pinnedIdsKey, loadPinnedMessagesPage]);

  useEffect(() => {
    if (!id || !headlinePinMessageId) return;
    void ensureReplyParentHydration(id, headlinePinMessageId);
  }, [id, headlinePinMessageId, ensureReplyParentHydration]);

  const [expiryTick, setExpiryTick] = useState(0);

  useEffect(() => {
    const hasExpiring = reversedMessages.some((m) => m.expiresAt);
    if (!hasExpiring) return;
    const interval = setInterval(() => setExpiryTick((x) => x + 1), 1000);
    return () => clearInterval(interval);
  }, [reversedMessages]);

  const flatItems = useMemo(
    () =>
      mergePendingOutboxIntoFlatItems(
        buildFlatChatItems(reversedMessages, unreadCount, Date.now()),
        id,
        mediaOutboxJobs
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reversedMessages, unreadCount, expiryTick, id, mediaOutboxJobs]
  );

  // Viewport-scoped reaction fetch: request reactions only for message rows that
  // scroll into view, instead of bulk-fetching every loaded message on each
  // buffer change.
  useViewportReactionFetch({
    entityId: id,
    scrollViewportRef: scroll.scrollViewportRef,
    fetchReactions,
    ready: flatItems.length > 0 && id === activeConversationId,
  });

  const scrollOrchestration = useConversationScrollOrchestration({
    conversationId: id,
    activeConversationId,
    messageLayoutKey,
    flatItems,
    messagesLoading,
    activeMessages,
    conversation,
    activeMessagesOlderCursor,
    activeMessagesHasNewerPages,
    loadOlder,
    loadNewer,
    jumpToLatestMessages,
    scrollViewportRef: scroll.scrollViewportRef,
    messagesContentRef: scroll.messagesContentRef,
    isAtBottomRef: scroll.isAtBottomRef,
    scrollToBottom: scroll.scrollToBottom,
    setIsAtBottom,
    pinToBottom: scroll.pinToBottom,
    historyAnchorActiveRef,
    cachedScrollIndex: scroll.cachedScrollIndex,
    fetchMessagesAround,
    searchParams,
    setSearchParams,
    openSettings: useCallback(() => setActivePane('settings'), []),
    setFlashingMessageId: messageActions.setFlashingMessageId,
    activeMessagesRef,
  });

  const toolbarSubtitle: ReactNode = useMemo(() => {
    if (!headerCopy) return null;
    if (!headlinePinMessageId) return headerCopy.subtitle;
    const msg = messagesById.get(headlinePinMessageId);
    const text = formatPinPreviewForToolbar(msg, t);
    return (
      <button
        type="button"
        className="conversation-toolbar-subtitle conversation-toolbar-subtitle--latest-pin"
        onClick={() => void scrollOrchestration.scrollToMessageId(headlinePinMessageId)}
        title={t('conversations.headerLatestPinTooltip', 'Open the newest pinned message (by send time)')}
      >
        <Icon name="locationPin" size="sm" aria-hidden />
        <span className="conversation-toolbar-subtitle-latest-pin-text">{text}</span>
      </button>
    );
  }, [headerCopy, headlinePinMessageId, messagesById, t, scrollOrchestration.scrollToMessageId]);

  useEffect(() => {
    messageActions.setReplyingTo(null);
    messageActions.setFlashingMessageId(null);
    scrollOrchestration.resetScrollRefsOnConversationIdChange();
    clearMediaCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, scrollOrchestration.resetScrollRefsOnConversationIdChange]);

  useEffect(() => {
    if (!id) return;
    const seen = new Set<string>();
    for (const item of flatItems) {
      if (item.type !== 'message') continue;
      const parentId = item.msg.replyToMessageId;
      if (!parentId || seen.has(parentId)) continue;
      seen.add(parentId);
      if (messagesById.has(parentId)) continue;
      void ensureReplyParentHydration(id, parentId);
    }
  }, [id, flatItems, messagesById, ensureReplyParentHydration]);

  const hasMediaOutboxJobs = useMemo(
    () => mediaOutboxJobs.some(
      (j) =>
        j.conversationId === id &&
        j.stage !== 'completed' &&
        j.stage !== 'cancelled',
    ),
    [mediaOutboxJobs, id],
  );

  const checkMessageAchievements = useMessageAchievements();

  const composerAdapter = useConversationComposerAdapter({
    conversationId: id,
    identityId: identity?.id,
    conversation,
    activeMessagesRef,
    conversationRef,
    activeMessagesHasNewerPages,
    sendTextMessage,
    checkMessageAchievements,
    jumpToLatestMessages,
    scrollToBottom: scroll.scrollToBottom,
    markJustSent: scroll.markJustSent,
    setIsAtBottom,
    setBlockedByOther,
    replyingTo: messageActions.replyingTo,
    setReplyingTo: messageActions.setReplyingTo,
    editingMessage: messageActions.editingMessage,
    setEditingMessage: messageActions.setEditingMessage,
    editTextMessage,
    onEditMaxReached: messageActions.onEditMaxReached,
    participantProfiles,
    memberSettings,
    t,
    scrollToMessageId: scrollOrchestration.scrollToMessageId,
  });

  if (!conversation) {
    return (
      <div className="conversation-not-found">
        <p>{t('conversations.notFound', 'Conversation not found')}</p>
        <Link to="/">{t('conversations.backHome', 'Back to home')}</Link>
      </div>
    );
  }

  const {
    otherParticipantIds: otherParticipants,
    displayName,
  } = headerCopy!;

  const isDmBlocked = conversation.type === 'dm' && otherParticipants.length === 1 && checkBlocked(otherParticipants[0]!);

  const isCurrentUserAdmin = !!(identity?.id && conversation.admins?.includes(identity.id));
  const canEditMemberSettings = conversation.type === 'dm' || isCurrentUserAdmin;
  const isSoleMember = conversation.participants.length <= 1;
  const isTopicalDm =
    conversation.type === 'dm' && !!(conversation.encryptedName && conversation.nameNonce);
  const canDeleteConversation =
    conversation.type === 'group' ? isCurrentUserAdmin : isTopicalDm;

  const canManagePinsUi = canManageConversationPinsView(conversation, identity?.id);

  return (
    <div className="conversation-page">
      <div className="conversation-container">
        <ConversationHeader
          conversation={conversation}
          identity={identity}
          t={t}
          displayName={displayName}
          avatarMembers={toolbarAvatarMembers}
          subtitle={toolbarSubtitle}
          isDmBlocked={isDmBlocked}
          blockedByOther={blockedByOther}
          audioAllowed={call.audioAllowed}
          isInCallElsewhere={call.isInCallElsewhere}
          isInCallHere={call.isInCallHere}
          onStartCall={() =>
            id && call.callSession.requestStartCall(id, { audio: true, video: false, screenshare: false })
          }
          canManagePins={canManagePinsUi}
          participantProfiles={participantProfiles}
          memberSettings={memberSettings}
          messagesById={messagesById}
          memberColorDisplay={memberColorDisplay}
          loadPinnedMessagesPage={loadPinnedMessagesPage}
          scrollToMessageId={scrollOrchestration.scrollToMessageId}
          onUnpin={messageActions.handleUnpinMessage}
          ensureReplyParentHydration={ensureReplyParentHydration}
          prefs={prefs}
          mediaOutboxOpen={mediaOutboxOpen}
          setMediaOutboxOpen={setMediaOutboxOpen}
          hasMediaOutboxJobs={hasMediaOutboxJobs}
          onOpenMemberSecurity={security.openMemberSecurity}
          messageSearchSessionActive={search.messageSearchSessionActive}
          onToggleMessageSearch={search.handleToggleMessageSearch}
          activePane={activePane}
          setActivePane={setActivePane}
          canDeleteConversation={canDeleteConversation}
          onDeleteGroup={() => dialogs.setDeleteGroupOpen(true)}
          onLeave={dialogs.handleLeaveClick}
        />

        <ChatConnectionBanner />

        <ConversationCallSection conversationId={id} call={call} />

        <div className={`conversation-body${call.isInCallHere ? ' conversation-body--in-call' : ''}`}>
          <ConversationMainPanel
            conversationId={conversation.id}
            activeConversationId={activeConversationId}
            conversation={conversation}
            identity={identity}
            participantProfiles={participantProfiles}
            memberSettings={memberSettings}
            displayName={displayName}
            flatItems={flatItems}
            messagesLoading={messagesLoading}
            reversedMessagesLength={reversedMessages.length}
            messagesById={messagesById}
            unreadCount={unreadCount}
            fsInfo={fsInfo}
            lastMessageText={lastMessageText}
            messageLayout={messageLayout}
            memberColorDisplay={memberColorDisplay}
            favoriteEmojis={favoriteEmojis}
            customEmojis={composerCustomEmojis}
            isFreeTier={isFreeTier}
            hasMoreOlder={!!activeMessagesOlderCursor}
            hasNewerPages={activeMessagesHasNewerPages}
            showManualLoadOlder={activeShowManualLoadOlder}
            showManualLoadNewer={activeShowManualLoadNewer}
            onManualLoadOlder={scrollOrchestration.handleReachOlder}
            onManualLoadNewer={scrollOrchestration.handleReachNewer}
            canManagePins={canManagePinsUi}
            sending={sending}
            composerRef={composerRef}
            mentionInsertRef={mentionInsertRef}
            isDmBlocked={isDmBlocked}
            blockedByOther={blockedByOther}
            otherParticipants={otherParticipants}
            onUnblock={unblockIdentity}
            onUnblockSuccess={() => toast.success(t('blocked.userUnblocked'))}
            onUnblockError={(message) => toast.error(message)}
            getGroupedReactions={getGroupedReactions}
            onReact={handleReact}
            onToggleReaction={handleToggleReaction}
            onAddFavorite={addFavorite}
            onRemoveFavorite={removeFavorite}
            onMentionClick={handleMentionClick}
            onLinkClick={dialogs.handleLinkClick}
            t={t}
            scroll={scroll}
            scrollOrchestration={scrollOrchestration}
            fileDrop={fileDrop}
            messageActions={messageActions}
            security={security}
            prefs={prefs}
            composerAdapter={composerAdapter}
          />

          <ConversationSidebars
            conversationId={conversation.id}
            conversation={conversation}
            activePane={activePane}
            onCloseActivePane={() => setActivePane(null)}
            identity={identity}
            participantProfiles={participantProfiles}
            memberSettings={memberSettings}
            isCurrentUserAdmin={isCurrentUserAdmin}
            canEditMemberSettings={canEditMemberSettings}
            fsConfigEnabled={fsConfig.enabled}
            memberColorDisplay={memberColorDisplay}
            dialogs={dialogs}
            adminSettings={adminSettings}
            prefs={prefs}
            onOpenMemberSecurity={security.openMemberSecurity}
            onAddMember={() =>
              navigate('/conversations/new', {
                state: { preSelectedIds: otherParticipants },
              })
            }
            pendingInvites={pendingInvites}
            pendingInvitesLoading={pendingInvitesLoading}
            onRevokeInvite={handleRevokeInvite}
            messageSearchSessionActive={search.messageSearchSessionActive}
            messageSearchCacheMode={messageSearchCacheMode}
            getActiveMessages={getActiveMessages}
            loadOlder={() => loadOlder()}
            messagesLoading={messagesLoading}
            activeMessagesOlderCursor={activeMessagesOlderCursor}
            onEndSearchSession={search.handleMessageSearchEndSession}
            scrollToMessageId={scrollOrchestration.scrollToMessageId}
            selfParticipantJoinedAtMs={selfParticipantJoinedAtMs}
          />
        </div>
      </div>

      <ConversationOverlays
        conversation={conversation}
        identityId={identity?.id}
        identityApi={api.identity}
        participantProfiles={participantProfiles}
        otherParticipants={otherParticipants}
        isCurrentUserAdmin={isCurrentUserAdmin}
        isSoleMember={isSoleMember}
        security={security}
        dialogs={dialogs}
        messageActions={messageActions}
        pendingInvites={pendingInvites}
        onInviteMemberSuccess={refreshPendingInvites}
        onCreateNewConversation={() =>
          navigate('/conversations/new', {
            state: { preSelectedIds: otherParticipants },
          })
        }
      />
    </div>
  );
}
