/**
 * Conversation View Page
 *
 * Displays messages for a conversation with a message composer.
 * Uses the existing .conversation-* and .dm-message-* CSS classes
 * from the global stylesheet.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode, type DragEvent } from 'react';
import { createApiClient, type IdentityPublicKeys } from '@adieuu/shared';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations, type DisplayMessage } from '../../hooks/useConversations';
import { useConversationScroll } from '../../hooks/useConversationScroll';
import { useIdentity } from '../../hooks/useIdentity';
import { useCustomEmojis } from '../../hooks/useCustomEmojis';
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
import { endMessageSearchSessionAndWipeCache } from '../../services/messageSearch/messageSearchSessionEnd';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useMessageAchievements } from '../../hooks/useMessageAchievements';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { MessageComposer, type MessageComposerHandle } from '../../components/composer';
import { ConversationToolbar } from './ConversationToolbar';
import { ConversationMessageSearchPanel } from './ConversationMessageSearch';
import { ConversationSettingsSidebar } from './ConversationSettingsSidebar';
import { ConversationMembersSidebar } from './ConversationMembersSidebar';
import { ConversationDialogs } from './ConversationDialogs';
import { ConversationMessageList } from './ConversationMessageList';
import { useBlockContext } from '../../hooks/useBlockContext';
import { useCallSession } from '../../hooks/useCallSession';
import { useCall } from '../../hooks/useCall';
import { ConversationCallButton } from '../../components/call/ConversationCallButton';
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
  formatPinPreviewForToolbar,
  getConversationHeaderCopy,
  getLastMessagePreviewText,
  getReversedVisibleMessages,
  getToolbarAvatarMemberIds,
  mergePendingOutboxIntoFlatItems,
  resolveToolbarParticipantName,
} from './conversationViewModel';
import { ConversationPinsMenu } from './ConversationPinsMenu';
import { useMediaOutbox, useMediaOutboxJobList } from '../../services/mediaOutbox';
import { ConversationMediaOutboxMenu } from './ConversationMediaOutboxMenu';
import { MemberSecurityModal } from './MemberSecurityModal';
import { buildForwardSecrecyUiLabels } from './forwardSecrecyLabels';
import { Tooltip } from '../../components/Tooltip';
import { useMessageSearchCacheMode } from '../../hooks/useMessageSearchPreferences';
import { parsePayload } from '../../services/messagePayload';

export function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identity } = useIdentity();
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

  const { registerConversationOutboxHooks } = useMediaOutbox();
  const mediaOutboxJobs = useMediaOutboxJobList();

  useEffect(() => {
    if (!id) return;
    registerConversationOutboxHooks(id, { markJustSent, scrollToBottom });
    return () => {
      registerConversationOutboxHooks(id, null);
    };
  }, [id, markJustSent, scrollToBottom, registerConversationOutboxHooks]);

  useEffect(() => {
    if (!id) return;
    void fetchConversationById(id);
  }, [id, fetchConversationById]);

  const [replyingTo, setReplyingTo] = useState<DisplayMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DisplayMessage | null>(null);
  const [flashingMessageId, setFlashingMessageId] = useState<string | null>(null);
  type ConversationPane = 'settings' | 'members' | 'search' | null;
  const [activePane, setActivePane] = useState<ConversationPane>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberSecurityModal, setMemberSecurityModal] = useState<{ id: string; label: string } | null>(
    null,
  );

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [adminTransferOpen, setAdminTransferOpen] = useState(false);
  const [pendingLinkHref, setPendingLinkHref] = useState<string | null>(null);
  const [mediaOutboxOpen, setMediaOutboxOpen] = useState(false);
  const hasMediaOutboxJobs = useMemo(
    () => mediaOutboxJobs.some(
      (j) =>
        j.conversationId === id &&
        j.stage !== 'completed' &&
        j.stage !== 'cancelled',
    ),
    [mediaOutboxJobs, id],
  );

  const mentionInsertRef = useRef<((identityId: string) => void) | null>(null);
  const composerRef = useRef<MessageComposerHandle | null>(null);
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

  const openMemberSecurity = useCallback((identityId: string, displayLabel: string) => {
    setMemberSecurityModal({ id: identityId, label: displayLabel });
  }, []);

  const [peerPublicKeysById, setPeerPublicKeysById] = useState<Record<string, IdentityPublicKeys>>({});
  const [verificationRevision, setVerificationRevision] = useState(0);
  const bumpVerificationRevision = useCallback(() => {
    setVerificationRevision((n) => n + 1);
  }, []);
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

  const handleGifContentFilterChange = useCallback(
    async (filter: import('@adieuu/shared').GifContentFilter) => {
      if (!id) return;
      await updateGifContentFilter(id, filter);
    },
    [id, updateGifContentFilter],
  );

  const handleCustomEmojisDisabledByAdminToggle = useCallback(
    async (disabled: boolean) => {
      if (!id) return;
      await updateCustomEmojisDisabled(id, disabled);
    },
    [id, updateCustomEmojisDisabled],
  );

  const handleMessageSearchCachePolicyToggle = useCallback(
    async (disallow: boolean) => {
      if (!id) return;
      await updateMessageSearchCachePolicy(id, disallow);
    },
    [id, updateMessageSearchCachePolicy],
  );

  const handleAllowSkipModerationToggle = useCallback(
    async (allow: boolean) => {
      if (!id) return;
      await updateAllowSkipModeration(id, allow);
    },
    [id, updateAllowSkipModeration],
  );

  const handleAudioCallsDisabledToggle = useCallback(
    async (disabled: boolean) => {
      if (!id) return;
      await updateCallSettings(id, { audioCallsDisabled: disabled });
    },
    [id, updateCallSettings],
  );

  const handleVideoCallsDisabledToggle = useCallback(
    async (disabled: boolean) => {
      if (!id) return;
      await updateCallSettings(id, { videoCallsDisabled: disabled });
    },
    [id, updateCallSettings],
  );

  const handleScreenshareDisabledToggle = useCallback(
    async (disabled: boolean) => {
      if (!id) return;
      await updateCallSettings(id, { screenshareDisabled: disabled });
    },
    [id, updateCallSettings],
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

  const selfParticipantJoinedAtMs = useMemo(() => {
    const selfId = identity?.id;
    if (!selfId || !conversation?.participantJoinedAtByIdentityId) return null;
    const iso = conversation.participantJoinedAtByIdentityId[selfId];
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  }, [conversation?.participantJoinedAtByIdentityId, identity?.id]);

  useEffect(() => {
    setPeerPublicKeysById({});
  }, [conversation?.id]);

  useEffect(() => {
    if (!conversation?.id) return;
    let cancelled = false;
    const participants = conversation.participants;
    void Promise.all(
      participants.map(async (pid) => {
        const res = await api.identity.getPublicKeys(pid);
        if (cancelled || !res.success || !res.data) return;
        setPeerPublicKeysById((prev) => ({ ...prev, [pid]: res.data! }));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [conversation?.id, conversation?.participants.join(','), api.identity]);

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

  const callSession = useCallSession();
  useCall(id ?? null);
  const activeMessagesRef = useRef(activeMessages);
  activeMessagesRef.current = activeMessages;
  const getActiveMessages = useCallback(() => activeMessagesRef.current, []);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const [messageSearchSessionActive, setMessageSearchSessionActive] = useState(false);
  const [messageSearchCacheMode] = useMessageSearchCacheMode(identity?.id ?? '');
  const [headlinePinMessageId, setHeadlinePinMessageId] = useState<string | null>(null);

  const handleMessageSearchEndSession = useCallback(() => {
    setMessageSearchSessionActive(false);
    setActivePane((prev) => (prev === 'search' ? null : prev));
  }, []);

  const handleToggleMessageSearch = useCallback(() => {
    if (!messageSearchSessionActive) {
      setMessageSearchSessionActive(true);
      setActivePane('search');
      return;
    }
    if (activePane !== 'search') {
      setActivePane('search');
      return;
    }
    if (id && identity?.id) {
      endMessageSearchSessionAndWipeCache({
        identityId: identity.id,
        conversationId: id,
        adminDisallowPersistentCache: conversation?.disallowPersistentMessageSearchCache ?? false,
      });
    }
    handleMessageSearchEndSession();
  }, [
    messageSearchSessionActive,
    activePane,
    id,
    identity?.id,
    conversation?.disallowPersistentMessageSearchCache,
    handleMessageSearchEndSession,
  ]);

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

  const [conversationDropActive, setConversationDropActive] = useState(false);

  useEffect(() => {
    setConversationDropActive(false);
  }, [id]);

  const handleConversationDragEnter = useCallback(
    (e: DragEvent) => {
      if (composerInteractionDisabled) return;
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setConversationDropActive(true);
    },
    [composerInteractionDisabled],
  );

  const handleConversationDragLeave = useCallback(
    (e: DragEvent) => {
      if (composerInteractionDisabled) return;
      const related = e.relatedTarget as Node | null;
      if (related && (e.currentTarget as HTMLElement).contains(related)) return;
      setConversationDropActive(false);
    },
    [composerInteractionDisabled],
  );

  const handleConversationDragOver = useCallback(
    (e: DragEvent) => {
      if (composerInteractionDisabled) return;
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [composerInteractionDisabled],
  );

  const handleConversationDrop = useCallback(
    (e: DragEvent) => {
      if (composerInteractionDisabled) return;
      e.preventDefault();
      setConversationDropActive(false);
      const { files } = e.dataTransfer;
      if (files?.length) {
        composerRef.current?.addMediaFiles(files);
      }
    },
    [composerInteractionDisabled],
  );

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
    openSettings: useCallback(() => setActivePane('settings'), []),
    setFlashingMessageId,
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
        onClick={() => void scrollToMessageId(headlinePinMessageId)}
        title={t('conversations.headerLatestPinTooltip', 'Open the newest pinned message (by send time)')}
      >
        <Icon name="locationPin" size="sm" aria-hidden />
        <span className="conversation-toolbar-subtitle-latest-pin-text">{text}</span>
      </button>
    );
  }, [headerCopy, headlinePinMessageId, messagesById, t, scrollToMessageId]);

  useEffect(() => {
    setReplyingTo(null);
    setFlashingMessageId(null);
    resetScrollRefsOnConversationIdChange();
    clearMediaCache();
  }, [id, resetScrollRefsOnConversationIdChange]);

  useEffect(() => {
    setMessageSearchSessionActive(false);
    setActivePane(null);
  }, [id]);

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

  const handleStartEdit = useCallback(
    (msg: DisplayMessage) => {
      const raw = msg.decryptedContent ?? '';
      const parsed = parsePayload(raw);
      if (parsed.gifAttachments.length > 0 || parsed.attachments.length > 0) {
        toast.error(t('conversations.editNoAttachments'));
        return;
      }
      setReplyingTo(null);
      setEditingMessage(msg);
    },
    [t, toast]
  );

  const onEditMaxReached = useCallback(() => {
    toast.error(t('conversations.messageEditMax'));
  }, [t, toast]);

  const checkMessageAchievements = useMessageAchievements();

  const editingInitialPlaintext = useMemo(() => {
    if (!editingMessage?.decryptedContent) return '';
    return parsePayload(editingMessage.decryptedContent).text;
  }, [editingMessage]);

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
    editingMessage,
    setEditingMessage,
    editTextMessage,
    onEditMaxReached,
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

  const audioAllowed = !(conversation.audioCallsDisabled ?? false);

  const isInCallElsewhere =
    callSession.activeSession !== null &&
    callSession.activeSession.conversationId !== id;
  const isInCallHere =
    callSession.activeSession !== null &&
    callSession.activeSession.conversationId === id;

  return (
    <div className="conversation-page">
        <div className="conversation-container">
          <ConversationToolbar
            displayName={displayName}
            avatarMembers={toolbarAvatarMembers}
            subtitle={toolbarSubtitle!}
            callSlot={
              audioAllowed && !isDmBlocked && !blockedByOther ? (
                <ConversationCallButton
                  disabled={isInCallElsewhere}
                  disabledReason={isInCallElsewhere ? t('call.alreadyInCall') : undefined}
                  inCallForThisConversation={isInCallHere}
                  onStartCall={() => id && callSession.requestStartCall(id, { audio: true, video: false, screenshare: false })}
                  onFocusOverlay={undefined}
                />
              ) : undefined
            }
            pinsSlot={
              <ConversationPinsMenu
                conversationId={conversation.id}
                pinnedCount={conversation.pinnedMessageIds?.length ?? 0}
                pinnedMessageIdsKey={(conversation.pinnedMessageIds ?? []).join(',')}
                loadPinnedMessagesPage={loadPinnedMessagesPage}
                scrollToMessageId={scrollToMessageId}
                onUnpin={handleUnpinMessage}
                canUnpin={canManagePinsUi}
                participantProfiles={participantProfiles}
                memberSettings={memberSettings}
                messagesById={messagesById}
                ensureReplyParentHydration={ensureReplyParentHydration}
                identity={identity ?? undefined}
                memberColorDisplay={memberColorDisplay}
                gifsEnabled={
                  !(conversation.gifsDisabled ?? false) && !convGifHidden && !gifsGloballyDisabled
                }
                gifAnimateOnHoverOnly={effectiveGifAnimateOnHover}
              />
            }
            mediaJobsSlot={
              <ConversationMediaOutboxMenu
                conversationId={conversation.id}
                externalOpen={mediaOutboxOpen}
                onExternalOpenChange={setMediaOutboxOpen}
              />
            }
            deviceSignaturesSlot={
              identity?.id ? (
                <Tooltip
                  content={t('conversations.memberSecurity.toolbarTooltip', 'Open your device signatures for this conversation')}
                  position="bottom"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="conversation-toolbar-btn conversation-toolbar-btn--icon-only"
                    onClick={() => openMemberSecurity(identity.id, t('conversations.you', 'You'))}
                    aria-label={t('conversations.memberSecurity.toolbarAria', 'Device signatures')}
                  >
                    <span className="conversation-toolbar-btn-icon" aria-hidden>
                      <Icon name="key" size="sm" />
                    </span>
                  </Button>
                </Tooltip>
              ) : null
            }
            searchSlot={
              <Tooltip
                content={
                  messageSearchSessionActive
                    ? t('conversations.messageSearch.endSearch', 'End search')
                    : t('conversations.messageSearch.toolbarAria', 'Search messages')
                }
                position="bottom"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className={`conversation-toolbar-btn conversation-toolbar-btn--icon-only${messageSearchSessionActive ? ' active' : ''}`}
                  onClick={handleToggleMessageSearch}
                  aria-label={
                    messageSearchSessionActive
                      ? t('conversations.messageSearch.endSearch', 'End search')
                      : t('conversations.messageSearch.toolbarAria', 'Search messages')
                  }
                  aria-pressed={messageSearchSessionActive}
                >
                  <span className="conversation-toolbar-btn-icon" aria-hidden>
                    <Icon name="search" size="sm" />
                  </span>
                </Button>
              </Tooltip>
            }
            showSettings={activePane === 'settings'}
            onToggleSettings={() => {
              setActivePane((prev) => (prev === 'settings' ? null : 'settings'));
            }}
            showMembers={activePane === 'members'}
            onToggleMembers={() => {
              setActivePane((prev) => (prev === 'members' ? null : 'members'));
            }}
            isGroup={conversation.type === 'group'}
            canDeleteConversation={canDeleteConversation}
            onDeleteGroup={() => setDeleteGroupOpen(true)}
            onLeave={handleLeaveClick}
            onToggleSearch={handleToggleMessageSearch}
            isSearchActive={messageSearchSessionActive}
            onToggleMediaOutbox={() => setMediaOutboxOpen((v) => !v)}
            hasMediaOutboxJobs={hasMediaOutboxJobs}
            onOpenDeviceSignatures={
              identity?.id
                ? () => openMemberSecurity(identity.id, t('conversations.you', 'You'))
                : undefined
            }
            hasDeviceSignatures={!!identity?.id}
          />

          <ChatConnectionBanner />

          <div className={`conversation-body${isInCallHere ? ' conversation-body--in-call' : ''}`}>
            <div
              className="conversation-main conversation-main-drop-target"
              onDragEnter={handleConversationDragEnter}
              onDragLeave={handleConversationDragLeave}
              onDragOver={handleConversationDragOver}
              onDrop={handleConversationDrop}
            >
            {conversationDropActive ? (
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
              onStartEdit={handleStartEdit}
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
              showManualLoadOlder={activeShowManualLoadOlder}
              showManualLoadNewer={activeShowManualLoadNewer}
              onManualLoadOlder={() => void loadOlder()}
              onManualLoadNewer={() => void loadNewer()}
              t={t as any}
              gifsDisabledByAdmin={conversation.gifsDisabled ?? false}
              customEmojisDisabledByAdmin={conversation.customEmojisDisabled === true}
              pinnedMessageIds={conversation.pinnedMessageIds ?? []}
              canManagePins={canManagePinsUi}
              onPinMessage={handlePinMessage}
              onUnpinMessage={handleUnpinMessage}
              onOpenMemberSecurity={openMemberSecurity}
              peerPublicKeysById={peerPublicKeysById}
              verificationRevision={verificationRevision}
              customEmojis={composerCustomEmojis}
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
              ref={composerRef}
              channelId={id!}
              sending={sending}
              onSend={composerSend}
              forwardSecrecy={{ enabled: useFs, onToggle: handleToggleFs }}
              replyContext={editingMessage ? null : composerReplyContext}
              mentionSource={composerMentionSource}
              placeholderTarget={displayName}
              mentionInsertRef={mentionInsertRef}
              gifsDisabled={(conversation.gifsDisabled ?? false) || convGifHidden || gifsGloballyDisabled}
              lastMessageText={lastMessageText}
              disabled={isDmBlocked || blockedByOther}
              customEmojis={composerCustomEmojis}
              customEmojisDisabled={conversation.customEmojisDisabled === true}
              editContext={
                editingMessage
                  ? { messageId: editingMessage.id, onCancel: () => setEditingMessage(null) }
                  : null
              }
              editingMessageKey={editingMessage?.id ?? null}
              editingInitialPlaintext={editingInitialPlaintext}
              allowSkipModeration={conversation.allowSkipModeration === true}
            />
          </div>

          {activePane === 'settings' && (
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
              gifContentFilter={conversation.gifContentFilter}
              onGifContentFilterChange={handleGifContentFilterChange}
              customEmojisDisabledByAdmin={conversation.customEmojisDisabled ?? false}
              onCustomEmojisDisabledByAdminToggle={handleCustomEmojisDisabledByAdminToggle}
              disallowPersistentMessageSearchCache={conversation.disallowPersistentMessageSearchCache ?? false}
              onMessageSearchCachePolicyToggle={handleMessageSearchCachePolicyToggle}
              allowSkipModeration={conversation.allowSkipModeration ?? false}
              onAllowSkipModerationToggle={handleAllowSkipModerationToggle}
              audioCallsDisabled={conversation.audioCallsDisabled ?? false}
              onAudioCallsDisabledToggle={handleAudioCallsDisabledToggle}
              videoCallsDisabled={conversation.videoCallsDisabled ?? false}
              onVideoCallsDisabledToggle={handleVideoCallsDisabledToggle}
              screenshareDisabled={conversation.screenshareDisabled ?? false}
              onScreenshareDisabledToggle={handleScreenshareDisabledToggle}
              gifsHiddenForMe={convGifHidden}
              onGifsHiddenForMeToggle={gifsGloballyDisabled ? undefined : setConvGifHidden}
              gifAnimateOnHoverOnly={effectiveGifAnimateOnHover}
              onGifAnimateOnHoverOnlyToggle={
                gifsGloballyDisabled ? undefined : handleGifAnimateOnHoverConversationToggle
              }
              onClose={() => setActivePane(null)}
            />
          )}

          {activePane === 'members' && (
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
              onOpenMemberSecurity={openMemberSecurity}
              onClose={() => setActivePane(null)}
            />
          )}

          {messageSearchSessionActive && id && (
            <ConversationMessageSearchPanel
              conversationId={id}
              identityId={identity?.id ?? ''}
              sidebarVisible={activePane === 'search'}
              adminDisallowPersistentCache={conversation.disallowPersistentMessageSearchCache ?? false}
              getActiveMessages={getActiveMessages}
              participantProfiles={participantProfiles}
              cacheMode={messageSearchCacheMode}
              loadOlder={() => loadOlder()}
              messagesLoading={messagesLoading}
              olderCursor={activeMessagesOlderCursor}
              onEndSearchSession={handleMessageSearchEndSession}
              onPickMessage={(messageId) => {
                void scrollToMessageId(messageId);
              }}
              selfParticipantJoinedAtMs={selfParticipantJoinedAtMs}
            />
          )}
        </div>
      </div>

      <MemberSecurityModal
        open={memberSecurityModal != null}
        onOpenChange={(open) => {
          if (!open) setMemberSecurityModal(null);
        }}
        identityId={memberSecurityModal?.id ?? null}
        subjectLabel={memberSecurityModal?.label ?? ''}
        isSelfSubject={
          memberSecurityModal != null && memberSecurityModal.id === identity?.id
        }
        identityApi={api.identity}
        onVerificationChange={bumpVerificationRevision}
      />

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
