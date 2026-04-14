/**
 * Conversation View Page
 *
 * Displays messages for a conversation with a message composer.
 * Uses the existing .conversation-* and .dm-message-* CSS classes
 * from the global stylesheet.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations, type DisplayMessage } from '../../hooks/useConversations';
import { useConversationScroll } from '../../hooks/useConversationScroll';
import { useIdentity } from '../../hooks/useIdentity';
import { usePreKeys } from '../../hooks/usePreKeys';
import { useReactions } from '../../hooks/useReactions';
import { useFavoriteEmojis } from '../../hooks/useFavoriteEmojis';
import { loadConversationFsDefault, saveConversationFsDefault, loadShowMessageArtifacts } from '../../services/preKeyService';
import {
  useGifPreference,
  useConversationGifHidden,
  loadGifAnimateOnHoverOnlyIdentity,
  useEffectiveGifAnimateOnHoverOnly,
  saveConversationGifAnimateOnHoverOverride,
} from '../../hooks/useGifPreference';
import { useAppConfig } from '../../config/PlatformContext';
import { useMessageLayoutPreference } from '../../hooks/useMessageLayoutPreference';
import { useMemberColorPreference } from '../../hooks/useMemberColorPreference';
import { extractDomain } from '../../utils/urlParsing';
import { isDomainTrusted } from '../../hooks/useExternalLinkPreferences';
import { clearMediaCache } from '../../hooks/useE2EMediaDownload';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useMessageAchievements } from '../../hooks/useMessageAchievements';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { MessageComposer } from '../../components/composer';
import { ConversationToolbar } from './ConversationToolbar';
import { ConversationSettingsSidebar } from './ConversationSettingsSidebar';
import { ConversationMembersSidebar } from './ConversationMembersSidebar';
import { ConversationDialogs } from './ConversationDialogs';
import { ConversationMessageList } from './ConversationMessageList';
import { useBlockContext } from '../../hooks/useBlockContext';
import { Icon } from '../../icons/Icon';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useConversationPendingInvites } from '../../hooks/conversations/useConversationPendingInvites';
import { useDmBlockedByOther } from '../../hooks/conversations/useDmBlockedByOther';
import { useConversationReactionHandlers } from '../../hooks/conversations/useConversationReactionHandlers';
import { useConversationComposerAdapter } from '../../hooks/conversations/useConversationComposerAdapter';
import { useConversationScrollOrchestration } from '../../hooks/conversations/useConversationScrollOrchestration';
import {
  buildFlatChatItems,
  buildMessagesByIdMap,
  canManageConversationPinsView,
  getConversationHeaderCopy,
  getLastMessagePreviewText,
  getReversedVisibleMessages,
} from './conversationViewModel';
import { ConversationPinsMenu } from './ConversationPinsMenu';
import { buildForwardSecrecyUiLabels } from './forwardSecrecyLabels';

export function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identity } = useIdentity();
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
    markConversationRead,
    sendTextMessage,
    loadOlder,
    loadNewer,
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

  const {
    fetchReactions,
    addReaction,
    removeReaction,
    getGroupedReactions,
  } = useReactions(id ?? null);
  const { favorites: favoriteEmojis, addFavorite, removeFavorite } = useFavoriteEmojis(identity?.id);

  const {
    scrollViewportRef,
    messagesContentRef,
    messagesContainerRef,
    isAtBottomRef,
    showScrollButton,
    scrollToBottom,
    scrollToBottomIfPinned,
    markJustSent,
    cachedScrollIndex,
    onScrollViewportScroll,
    onUserScrollIntent,
  } = useConversationScroll({
    conversationId: id,
    setIsAtBottom,
    markConversationRead,
    messageLayoutKey,
  });

  const [replyingTo, setReplyingTo] = useState<DisplayMessage | null>(null);
  const [flashingMessageId, setFlashingMessageId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [adminTransferOpen, setAdminTransferOpen] = useState(false);
  const [pendingLinkHref, setPendingLinkHref] = useState<string | null>(null);

  const mentionInsertRef = useRef<((identityId: string) => void) | null>(null);
  const handleMentionClick = useCallback((identityId: string) => {
    mentionInsertRef.current?.(identityId);
  }, []);

  const handleLinkClick = useCallback((href: string) => {
    const domain = extractDomain(href);
    if (domain && isDomainTrusted(domain)) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      setPendingLinkHref(href);
    }
  }, []);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const resolveDefaultFs = useCallback(() => {
    if (!id) return fsConfig.enabled;
    const convOverride = loadConversationFsDefault(id);
    return convOverride ?? fsConfig.enabled;
  }, [id, fsConfig.enabled]);

  const [useFs, setUseFs] = useState(resolveDefaultFs);
  const [convFsOverride, setConvFsOverride] = useState<boolean | null>(() =>
    id ? loadConversationFsDefault(id) : null
  );

  useEffect(() => {
    if (id) {
      const override = loadConversationFsDefault(id);
      setConvFsOverride(override);
      setUseFs(override ?? fsConfig.enabled);
    }
  }, [id, fsConfig.enabled]);

  const handleConvFsToggle = useCallback((enabled: boolean) => {
    if (!id) return;
    setConvFsOverride(enabled);
    saveConversationFsDefault(id, enabled);
    setUseFs(enabled);
  }, [id]);

  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [gifVisibility] = useGifPreference(identity?.id ?? '');
  const gifsGloballyDisabled = gifVisibility === 'disabled';
  const [convGifHidden, setConvGifHidden] = useConversationGifHidden(id ?? '');
  const effectiveGifAnimateOnHover = useEffectiveGifAnimateOnHoverOnly(identity?.id ?? '', id ?? '');

  const handleGifAnimateOnHoverConversationToggle = useCallback(
    (checked: boolean) => {
      if (!id || !identity?.id) return;
      saveConversationGifAnimateOnHoverOverride(
        id,
        checked,
        loadGifAnimateOnHoverOnlyIdentity(identity.id),
      );
    },
    [id, identity?.id],
  );

  const handleGifsDisabledByAdminToggle = useCallback(
    async (disabled: boolean) => {
      if (!id) return;
      await updateGifsDisabled(id, disabled);
    },
    [id, updateGifsDisabled],
  );

  const handleToggleFs = useCallback(() => {
    setUseFs((v) => !v);
  }, []);

  const handleRename = useCallback(async () => {
    if (!id || !renameValue.trim() || renaming) return;
    setRenaming(true);
    await renameGroup(id, renameValue.trim());
    setRenameValue('');
    setRenaming(false);
  }, [id, renameValue, renaming, renameGroup]);

  const conversation = conversations.find((c) => c.id === id);

  const {
    pendingInvites,
    pendingInvitesLoading,
    refreshPendingInvites,
    handleRevokeInvite,
  } = useConversationPendingInvites({
    conversationId: id,
    conversationType: conversation?.type,
    showMembers,
    listPendingGroupInvites,
    revokeGroupInvite,
    prefetchParticipantProfiles,
    pendingInvitesRefreshSignal,
  });

  const { blockedByOther, setBlockedByOther } = useDmBlockedByOther(api, conversation, identity?.id);

  const activeMessagesRef = useRef(activeMessages);
  activeMessagesRef.current = activeMessages;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

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
    fetchedReactionsForRef,
    handleReact,
    handleToggleReaction,
  } = useConversationReactionHandlers({
    conversationId: id,
    conversation,
    activeMessages,
    fetchReactions,
    addReaction,
    removeReaction,
    fetchRecipientKeys,
    scrollToBottomIfPinned,
  });

  useEffect(() => {
    if (id && id !== activeConversationId) {
      setActiveConversation(id);
      fetchedReactionsForRef.current = null;
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

  const [expiryTick, setExpiryTick] = useState(0);

  useEffect(() => {
    const hasExpiring = reversedMessages.some((m) => m.expiresAt);
    if (!hasExpiring) return;
    const interval = setInterval(() => setExpiryTick((x) => x + 1), 1000);
    return () => clearInterval(interval);
  }, [reversedMessages]);

  const flatItems = useMemo(
    () => buildFlatChatItems(reversedMessages, unreadCount, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reversedMessages, unreadCount, expiryTick]
  );

  const {
    handleReachOlder,
    handleReachNewer,
    handleJumpToLatest,
    scrollToMessageId,
    resetScrollRefsOnConversationIdChange,
  } = useConversationScrollOrchestration({
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
    scrollViewportRef,
    messagesContentRef,
    isAtBottomRef,
    scrollToBottom,
    setIsAtBottom,
    cachedScrollIndex,
    fetchMessagesAround,
    searchParams,
    setSearchParams,
    setShowSettings,
    setFlashingMessageId,
    activeMessagesRef,
  });

  useEffect(() => {
    setReplyingTo(null);
    setFlashingMessageId(null);
    resetScrollRefsOnConversationIdChange();
    clearMediaCache();
  }, [id, resetScrollRefsOnConversationIdChange]);

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

  const handleLeaveClick = useCallback(() => {
    if (!conversation) return;
    const isAdmin = identity?.id && conversation.admins.includes(identity.id);
    const otherAdmins = conversation.admins.filter((a) => a !== identity?.id);
    const isSoleMember = conversation.participants.length <= 1;

    if (isAdmin && otherAdmins.length === 0 && !isSoleMember) {
      setAdminTransferOpen(true);
    } else {
      setLeaveConfirmOpen(true);
    }
  }, [conversation, identity?.id]);

  const handleLeaveConfirm = useCallback(async () => {
    if (!id) return;
    setLeaving(true);
    const left = await leaveGroup(id);
    setLeaving(false);
    setLeaveConfirmOpen(false);
    if (left) navigate('/');
  }, [id, leaveGroup, navigate]);

  const handleAdminTransferLeave = useCallback(
    async (options: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }) => {
      if (!id) return;
      setLeaving(true);
      const left = await leaveGroup(id, options);
      setLeaving(false);
      setAdminTransferOpen(false);
      if (left) navigate('/');
    },
    [id, leaveGroup, navigate]
  );

  const handleDeleteGroup = useCallback(async () => {
    if (!id) return;
    setDeletingGroup(true);
    const deleted = await terminateGroup(id);
    setDeletingGroup(false);
    setDeleteGroupOpen(false);
    if (deleted) navigate('/');
  }, [id, terminateGroup, navigate]);

  const handlePromoteToAdmin = useCallback(
    async (memberId: string) => {
      if (!id) return;
      await promoteToAdmin(id, memberId);
    },
    [id, promoteToAdmin]
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      if (!id) return;
      await removeMember(id, memberId);
    },
    [id, removeMember]
  );

  const closeMemberEdit = useCallback(() => {
    setEditingMemberId(null);
  }, []);

  const saveMemberEdit = useCallback(async (memberId: string, nickname: string, color: string | undefined) => {
    if (!id) return;
    const updated: MemberSettingsMap = { ...memberSettings };
    const trimmed = nickname.trim();
    if (trimmed || color) {
      updated[memberId] = {
        ...(trimmed ? { nickname: trimmed } : {}),
        ...(color ? { color } : {}),
      };
    } else {
      delete updated[memberId];
    }
    await updateMemberSettings(id, updated);
    closeMemberEdit();
  }, [id, memberSettings, updateMemberSettings, closeMemberEdit]);

  const handleDeleteMessage = useCallback(
    (messageId: string, forEveryone: boolean) => {
      if (!id) return;
      deleteMessage(id, messageId, forEveryone);
    },
    [id, deleteMessage]
  );

  const handlePinMessage = useCallback(
    async (messageId: string) => {
      if (!id) return;
      const ok = await pinMessage(id, messageId);
      if (!ok) toast.error(t('conversations.pinFailed', 'Could not pin message'));
    },
    [id, pinMessage, toast, t]
  );

  const handleUnpinMessage = useCallback(
    async (messageId: string) => {
      if (!id) return;
      const ok = await unpinMessage(id, messageId);
      if (!ok) toast.error(t('conversations.unpinFailed', 'Could not unpin message'));
    },
    [id, unpinMessage, toast, t]
  );

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTargetMessageId, setReportTargetMessageId] = useState<string | undefined>();

  const handleReportMessage = useCallback(
    (messageId: string) => {
      setReportTargetMessageId(messageId);
      setReportModalOpen(true);
    },
    []
  );

  const checkMessageAchievements = useMessageAchievements();

  const { composerSend, composerReplyContext, composerMentionSource } = useConversationComposerAdapter({
    conversationId: id,
    identityId: identity?.id,
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
    participantProfiles,
    memberSettings,
    t,
    scrollToMessageId,
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
    subtitle,
  } = getConversationHeaderCopy(
    conversation,
    identity?.id,
    participantProfiles,
    memberSettings,
    t
  );

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
        <ConversationToolbar
          displayName={displayName}
          subtitle={subtitle}
          pinsSlot={
            <ConversationPinsMenu
              conversationId={conversation.id}
              pinnedCount={conversation.pinnedMessageIds?.length ?? 0}
              loadPinnedMessagesPage={loadPinnedMessagesPage}
              scrollToMessageId={scrollToMessageId}
              onUnpin={handleUnpinMessage}
              canUnpin={canManagePinsUi}
              participantProfiles={participantProfiles}
              memberSettings={memberSettings}
            />
          }
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings((v) => !v)}
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers((v) => !v)}
          isGroup={conversation.type === 'group'}
          canDeleteConversation={canDeleteConversation}
          onDeleteGroup={() => setDeleteGroupOpen(true)}
          onLeave={handleLeaveClick}
        />

        <ChatConnectionBanner />

        <div className="conversation-body">
          <div className="conversation-main">
            <ConversationMessageList
              conversationId={id}
              activeConversationId={activeConversationId}
              flatItems={flatItems}
              messagesLoading={messagesLoading}
              reversedMessagesLength={reversedMessages.length}
              messagesById={messagesById}
              identity={identity}
              participantProfiles={participantProfiles}
              memberSettings={memberSettings}
              messageLayout={messageLayout}
              memberColorDisplay={memberColorDisplay}
              favoriteEmojis={favoriteEmojis}
              fsInfo={fsInfo}
              flashingMessageId={flashingMessageId}
              getGroupedReactions={getGroupedReactions}
              onDeleteMessage={handleDeleteMessage}
              onReact={handleReact}
              onToggleReaction={handleToggleReaction}
              onReportMessage={handleReportMessage}
              onAddFavorite={addFavorite}
              onRemoveFavorite={removeFavorite}
              onReply={setReplyingTo}
              onLinkClick={handleLinkClick}
              onMentionClick={handleMentionClick}
              scrollToMessageId={scrollToMessageId}
              showScrollButton={showScrollButton}
              unreadCount={unreadCount}
              onJumpToLatest={handleJumpToLatest}
              scrollViewportRef={scrollViewportRef}
              messagesContentRef={messagesContentRef}
              messagesContainerRef={messagesContainerRef}
              onScrollViewportScroll={onScrollViewportScroll}
              onUserScrollIntent={onUserScrollIntent}
              cachedScrollIndex={cachedScrollIndex}
              hasMoreOlder={!!activeMessagesOlderCursor}
              onReachOlder={handleReachOlder}
              hasNewerPages={activeMessagesHasNewerPages}
              onReachNewer={handleReachNewer}
              t={t as any}
              gifsDisabledByAdmin={conversation.gifsDisabled ?? false}
              pinnedMessageIds={conversation.pinnedMessageIds ?? []}
              canManagePins={canManagePinsUi}
              onPinMessage={handlePinMessage}
              onUnpinMessage={handleUnpinMessage}
            />

            {isDmBlocked && (
              <div className="blocked-conversation-banner">
                <Icon name="ban" />
                <span>{t('blocked.blockedBanner')}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const result = await unblockIdentity(otherParticipants[0]!);
                    if (result.success) {
                      toast.success(t('blocked.userUnblocked'));
                    } else {
                      toast.error(result.error ?? t('blocked.unblock'));
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
            <MessageComposer
              channelId={id!}
              sending={sending}
              onSend={composerSend}
              forwardSecrecy={{ enabled: useFs, onToggle: handleToggleFs }}
              replyContext={composerReplyContext}
              mentionSource={composerMentionSource}
              placeholderTarget={displayName}
              mentionInsertRef={mentionInsertRef}
              gifsDisabled={(conversation.gifsDisabled ?? false) || convGifHidden || gifsGloballyDisabled}
              lastMessageText={lastMessageText}
              disabled={isDmBlocked || blockedByOther}
            />
          </div>

          {showSettings && (
            <ConversationSettingsSidebar
              isGroup={conversation.type === 'group'}
              isAdmin={isCurrentUserAdmin}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              currentGroupName={conversation.decryptedName}
              renaming={renaming}
              onRename={handleRename}
              fsEnabled={convFsOverride ?? fsConfig.enabled}
              onFsToggle={handleConvFsToggle}
              memberColorDisplay={memberColorDisplay}
              gifsDisabledByAdmin={conversation.gifsDisabled ?? false}
              onGifsDisabledByAdminToggle={handleGifsDisabledByAdminToggle}
              gifsHiddenForMe={convGifHidden}
              onGifsHiddenForMeToggle={gifsGloballyDisabled ? undefined : setConvGifHidden}
              gifAnimateOnHoverOnly={effectiveGifAnimateOnHover}
              onGifAnimateOnHoverOnlyToggle={
                gifsGloballyDisabled ? undefined : handleGifAnimateOnHoverConversationToggle
              }
            />
          )}

          {showMembers && (
            <ConversationMembersSidebar
              participants={conversation.participants}
              participantProfiles={participantProfiles}
              memberSettings={memberSettings}
              admins={conversation.admins}
              conversationType={conversation.type}
              isCurrentUserAdmin={isCurrentUserAdmin}
              canEditMemberSettings={canEditMemberSettings}
              selfId={identity?.id}
              editingMemberId={editingMemberId}
              onEditMember={setEditingMemberId}
              onCloseMemberEdit={closeMemberEdit}
              onSaveMemberEdit={saveMemberEdit}
              onPromoteToAdmin={handlePromoteToAdmin}
              onRemoveMember={handleRemoveMember}
              onInviteMember={() => setInviteMemberOpen(true)}
              onAddMember={() => navigate('/conversations/new', {
                state: { preSelectedIds: otherParticipants },
              })}
              pendingInvites={conversation.type === 'group' ? pendingInvites : undefined}
              pendingInvitesLoading={
                conversation.type === 'group' ? pendingInvitesLoading : undefined
              }
              onRevokeInvite={
                conversation.type === 'group' && isCurrentUserAdmin
                  ? handleRevokeInvite
                  : undefined
              }
            />
          )}
        </div>
      </div>

      <ConversationDialogs
        conversationId={conversation.id}
        conversationType={conversation.type}
        isAdmin={isCurrentUserAdmin}
        isSoleMember={isSoleMember}
        participants={conversation.participants}
        otherParticipants={otherParticipants}
        participantProfiles={participantProfiles}
        selfId={identity?.id}
        leaveConfirmOpen={leaveConfirmOpen}
        setLeaveConfirmOpen={setLeaveConfirmOpen}
        leaving={leaving}
        onLeaveConfirm={handleLeaveConfirm}
        adminTransferOpen={adminTransferOpen}
        setAdminTransferOpen={setAdminTransferOpen}
        onAdminTransferLeave={handleAdminTransferLeave}
        deleteGroupOpen={deleteGroupOpen}
        setDeleteGroupOpen={setDeleteGroupOpen}
        deletingGroup={deletingGroup}
        onDeleteGroup={handleDeleteGroup}
        inviteMemberOpen={inviteMemberOpen}
        setInviteMemberOpen={setInviteMemberOpen}
        onCreateNewConversation={() => navigate('/conversations/new', {
          state: { preSelectedIds: otherParticipants },
        })}
        pendingInvites={conversation.type === 'group' ? pendingInvites : []}
        onInviteMemberSuccess={refreshPendingInvites}
        reportModalOpen={reportModalOpen}
        setReportModalOpen={setReportModalOpen}
        reportTargetMessageId={reportTargetMessageId}
        pendingLinkHref={pendingLinkHref}
        onCloseLinkModal={() => setPendingLinkHref(null)}
      />
    </div>
  );
}
