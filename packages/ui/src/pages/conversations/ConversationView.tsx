/**
 * Conversation View Page
 *
 * Displays messages for a conversation with a message composer.
 * Uses the existing .conversation-* and .dm-message-* CSS classes
 * from the global stylesheet.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createApiClient, type PublicGroupInvite } from '@adieuu/shared';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations, type DisplayMessage } from '../../hooks/useConversations';
import { useConversationScroll, clearConversationScrollCache } from '../../hooks/useConversationScroll';
import { useIdentity } from '../../hooks/useIdentity';
import { usePreKeys } from '../../hooks/usePreKeys';
import { useReactions } from '../../hooks/useReactions';
import { useFavoriteEmojis } from '../../hooks/useFavoriteEmojis';
import { loadConversationFsDefault, saveConversationFsDefault, loadShowMessageArtifacts, SECURITY_LEVEL_CONFIG } from '../../services/preKeyService';
import { useGifPreference, useConversationGifHidden } from '../../hooks/useGifPreference';
import { useAppConfig } from '../../config/PlatformContext';
import { useMessageLayoutPreference } from '../../hooks/useMessageLayoutPreference';
import { useMemberColorPreference } from '../../hooks/useMemberColorPreference';
import { extractDomain } from '../../utils/urlParsing';
import { isDomainTrusted } from '../../hooks/useExternalLinkPreferences';
import { clearMediaCache } from '../../hooks/useE2EMediaDownload';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useMessageAchievements } from '../../hooks/useMessageAchievements';
import { parsePayload } from '../../services/messagePayload';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { ComposerSendFn, ComposerReplyContext, MentionSource, MentionableUser } from '../../components/composer';
import { MessageComposer } from '../../components/composer';
import {
  type ChatItem,
  isSameDay,
  formatRotationInterval,
  resolveDisplayName,
  buildReplySnippet,
  replyComposerLabel,
} from './conversationUtils';
import {
  applyHistoryScrollAnchor,
  applyDistanceFromBottom,
  readDistanceFromBottom,
  REPLY_JUMP_CONTEXT_AFTER,
  REPLY_JUMP_CONTEXT_BEFORE,
  type HistoryScrollAnchor,
} from './conversationScrollUtils';
import { ConversationToolbar } from './ConversationToolbar';
import { ConversationSettingsSidebar } from './ConversationSettingsSidebar';
import { ConversationMembersSidebar } from './ConversationMembersSidebar';
import { ConversationDialogs } from './ConversationDialogs';
import { ConversationMessageList } from './ConversationMessageList';
import { useBlockContext } from '../../hooks/useBlockContext';
import { Icon } from '../../icons/Icon';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';

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
    replyParentHydrationMap,
    ensureReplyParentHydration,
    leaveGroup,
    removeMember,
    promoteToAdmin,
    terminateGroup,
    deleteMessage,
    renameGroup,
    updateMemberSettings,
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

  /** First visible row before loading older history — restored by key + viewport offset (stable vs scrollHeight deltas). */
  const historyScrollAnchorRef = useRef<{ anchorKey: string; targetViewportOffsetPx: number } | null>(null);

  const fetchedReactionsForRef = useRef<string | null>(null);
  const pendingReactionsRef = useRef<Set<string>>(new Set());
  const pendingScrollToRef = useRef<string | null>(null);
  /** True while a reply / deep-link around-fetch is in flight (avoids clearing pending before loading flips). */
  const replyAroundFetchPendingRef = useRef(false);
  /** `messageId` query on this conversation the first time `id` is set (survives deep-link strip). */
  const urlMessageIdOnConversationEntryRef = useRef<string | null>(null);
  const prevIdForUrlCaptureRef = useRef<string | undefined>(undefined);
  /** One-time snap to true bottom when opening without a cached scroll index (not on pagination). */
  const initialOpenBottomSnapDoneRef = useRef(false);
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
  const [pendingInvites, setPendingInvites] = useState<PublicGroupInvite[]>([]);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  // FS state: per-conversation override -> global default
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

  // GIF admin toggle
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [gifVisibility] = useGifPreference(identity?.id ?? '');
  const gifsGloballyDisabled = gifVisibility === 'disabled';
  const [convGifHidden, setConvGifHidden] = useConversationGifHidden(id ?? '');

  const [gifsDisabledOverride, setGifsDisabledOverride] = useState<boolean | null>(null);

  useEffect(() => {
    setGifsDisabledOverride(null);
  }, [id]);

  const handleGifsDisabledByAdminToggle = useCallback(async (disabled: boolean) => {
    if (!id) return;
    setGifsDisabledOverride(disabled);
    try {
      await api.conversations.updateGifsDisabled(id, disabled);
    } catch {
      setGifsDisabledOverride(null);
    }
  }, [id, api]);

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

  const refreshPendingInvites = useCallback(async () => {
    if (!id || conversation?.type !== 'group') return;
    setPendingInvitesLoading(true);
    try {
      const list = await listPendingGroupInvites(id);
      setPendingInvites(list);
    } finally {
      setPendingInvitesLoading(false);
    }
  }, [id, conversation?.type, listPendingGroupInvites]);

  useEffect(() => {
    if (!showMembers || conversation?.type !== 'group' || !id) return;
    void refreshPendingInvites();
  }, [showMembers, conversation?.type, id, refreshPendingInvites]);

  useEffect(() => {
    if (
      !pendingInvitesRefreshSignal ||
      pendingInvitesRefreshSignal.conversationId !== id ||
      !showMembers ||
      conversation?.type !== 'group'
    ) {
      return;
    }
    void refreshPendingInvites();
  }, [
    pendingInvitesRefreshSignal,
    id,
    showMembers,
    conversation?.type,
    refreshPendingInvites,
  ]);

  useEffect(() => {
    if (pendingInvites.length === 0) return;
    void prefetchParticipantProfiles(pendingInvites.map((i) => i.invitedIdentityId));
  }, [pendingInvites, prefetchParticipantProfiles]);

  const handleRevokeInvite = useCallback(
    async (inviteId: string) => {
      if (!id) return;
      const ok = await revokeGroupInvite(id, inviteId);
      if (!ok) {
        toast.error(
          t('conversations.revokeInviteFailed', 'Could not revoke the invite.')
        );
      }
    },
    [id, revokeGroupInvite, toast, t]
  );

  // Detect when the other party has blocked us (bidirectional check)
  const [blockedByOther, setBlockedByOther] = useState(false);
  useEffect(() => {
    setBlockedByOther(false);
    if (!conversation || conversation.type !== 'dm' || !identity?.id) return;
    const otherId = conversation.participants.find((p) => p !== identity.id);
    if (!otherId) return;
    let cancelled = false;
    api.blocks.checkBlockedByEither(otherId).then((resp) => {
      if (cancelled) return;
      if (resp.data) {
        setBlockedByOther(resp.data.blockedByEither && !resp.data.blockedByYou);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [conversation?.id, conversation?.type, identity?.id, api]);

  const effectiveGifsDisabled = gifsDisabledOverride ?? conversation?.gifsDisabled ?? false;

  useEffect(() => {
    if (gifsDisabledOverride !== null && conversation?.gifsDisabled === gifsDisabledOverride) {
      setGifsDisabledOverride(null);
    }
  }, [conversation?.gifsDisabled, gifsDisabledOverride]);

  const activeMessagesRef = useRef(activeMessages);
  activeMessagesRef.current = activeMessages;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const showArtifacts = identity ? loadShowMessageArtifacts(identity.id) : false;

  const reversedMessages = useMemo(
    () =>
      [...activeMessages]
        .reverse()
        .filter((msg) => {
          if (showArtifacts) return true;
          if (msg.messageType === 'system') return true;
          if (msg.deleted) return false;
          if (!msg.decryptedContent && msg.decryptionError) return false;
          return true;
        }),
    [activeMessages, showArtifacts]
  );

  const lastMessageText = useMemo(() => {
    for (let i = activeMessages.length - 1; i >= 0; i--) {
      const msg = activeMessages[i]!;
      if (!msg.decryptedContent || msg.deleted || msg.messageType === 'system') continue;
      const { text } = parsePayload(msg.decryptedContent);
      if (text) return text;
    }
    return undefined;
  }, [activeMessages]);

  useEffect(() => {
    if (id && id !== activeConversationId) {
      setActiveConversation(id);
      fetchedReactionsForRef.current = null;
    }
  }, [id, activeConversationId, setActiveConversation]);

  useEffect(() => {
    setReplyingTo(null);
    setFlashingMessageId(null);
    pendingScrollToRef.current = null;
    replyAroundFetchPendingRef.current = false;
    initialOpenBottomSnapDoneRef.current = false;
    historyScrollAnchorRef.current = null;
    clearMediaCache();
  }, [id]);

  useEffect(() => {
    if (prevIdForUrlCaptureRef.current !== id) {
      prevIdForUrlCaptureRef.current = id;
      urlMessageIdOnConversationEntryRef.current = searchParams.get('messageId');
    }
  }, [id, searchParams]);

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

  useEffect(() => {
    if (!id || activeMessages.length === 0) return;

    const key = `${id}:${activeMessages.length}`;
    if (fetchedReactionsForRef.current === key) return;
    fetchedReactionsForRef.current = key;

    const messageIds = activeMessages.map((m) => m.id);
    void fetchReactions(messageIds);
  }, [id, activeMessages, fetchReactions]);

  const handleReact = useCallback(
    async (messageId: string, emoji: string) => {
      if (!id || !conversationRef.current) return;
      const key = `${messageId}:${emoji}`;
      if (pendingReactionsRef.current.has(key)) return;
      pendingReactionsRef.current.add(key);
      try {
        const targetMsg = activeMessagesRef.current.find((m) => m.id === messageId);
        const useForwardSecrecy = targetMsg?.forwardSecrecy ?? false;
        const recipients = await fetchRecipientKeys(conversationRef.current.participants, useForwardSecrecy);
        if (recipients.length === 0) return;
        await addReaction(messageId, emoji, recipients);
        scrollToBottomIfPinned();
      } finally {
        pendingReactionsRef.current.delete(key);
      }
    },
    [id, addReaction, fetchRecipientKeys, scrollToBottomIfPinned]
  );

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string, ownReactionId?: string) => {
      const key = `${messageId}:${emoji}`;
      if (pendingReactionsRef.current.has(key)) return;
      if (ownReactionId) {
        pendingReactionsRef.current.add(key);
        try {
          await removeReaction(ownReactionId, messageId);
          scrollToBottomIfPinned();
        } finally {
          pendingReactionsRef.current.delete(key);
        }
      } else {
        await handleReact(messageId, emoji);
      }
    },
    [removeReaction, handleReact, scrollToBottomIfPinned]
  );

  const handleReachOlder = useCallback(() => {
    if (pendingScrollToRef.current) return;
    if (!activeMessagesOlderCursor || messagesLoading) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (vp && content) {
      const vRect = vp.getBoundingClientRect();
      for (let i = 0; i < content.children.length; i++) {
        const el = content.children[i] as HTMLElement;
        const key = el.dataset.scrollAnchorKey;
        if (!key) continue;
        const cr = el.getBoundingClientRect();
        if (cr.bottom > vRect.top + 1) {
          historyScrollAnchorRef.current = {
            anchorKey: key,
            targetViewportOffsetPx: cr.top - vRect.top,
          };
          break;
        }
      }
    }
    void loadOlder();
  }, [activeMessagesOlderCursor, messagesLoading, loadOlder, scrollViewportRef, messagesContentRef]);

  const handleReachNewer = useCallback(() => {
    if (pendingScrollToRef.current) return;
    if (!activeMessagesHasNewerPages || messagesLoading) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    const distBefore = vp ? readDistanceFromBottom(vp) : 0;
    /** Newest row before fetch; after merge, newer pages sit below it — anchor so we are not pinned to the bottom sentinel (avoids IO fetch chains). */
    let anchor: HistoryScrollAnchor | null = null;
    if (vp && content) {
      const headId = activeMessages[0]?.id;
      if (headId) {
        const vRect = vp.getBoundingClientRect();
        const escaped =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(headId)
            : headId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const row = content.querySelector(`[data-scroll-anchor-key="${escaped}"]`);
        if (row) {
          const cr = row.getBoundingClientRect();
          anchor = { anchorKey: headId, targetViewportOffsetPx: cr.top - vRect.top };
        }
      }
    }
    void loadNewer().then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = scrollViewportRef.current;
          const c = messagesContentRef.current;
          if (anchor && el && c) {
            applyHistoryScrollAnchor(el, c, anchor);
          } else if (el) {
            applyDistanceFromBottom(el, distBefore);
          }
        });
      });
    });
  }, [
    activeMessages,
    activeMessagesHasNewerPages,
    messagesLoading,
    loadNewer,
    scrollViewportRef,
    messagesContentRef,
  ]);

  const handleJumpToLatest = useCallback(async () => {
    if (!id) return;
    const lastId = conversation?.lastMessageId;
    const headId = activeMessages[0]?.id;
    if (
      !messagesLoading &&
      activeMessages.length > 0 &&
      !activeMessagesHasNewerPages &&
      lastId &&
      headId === lastId
    ) {
      clearConversationScrollCache(id);
      historyScrollAnchorRef.current = null;
      setIsAtBottom(true);
      scrollToBottom('smooth');
      return;
    }
    clearConversationScrollCache(id);
    historyScrollAnchorRef.current = null;
    setIsAtBottom(true);
    await jumpToLatestMessages(id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    });
  }, [
    id,
    conversation?.lastMessageId,
    activeMessages,
    messagesLoading,
    activeMessagesHasNewerPages,
    jumpToLatestMessages,
    scrollToBottom,
    setIsAtBottom,
  ]);

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

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTargetMessageId, setReportTargetMessageId] = useState<string | undefined>();

  const handleReportMessage = useCallback(
    (messageId: string) => {
      setReportTargetMessageId(messageId);
      setReportModalOpen(true);
    },
    []
  );

  const fsInfo = useMemo(() => {
    const levelConfig = SECURITY_LEVEL_CONFIG[fsConfig.securityLevel];
    const rotationLabel = formatRotationInterval(levelConfig.spkRotationIntervalMs);
    const hardDeleteLabel = formatRotationInterval(levelConfig.hardDeleteCapMs);
    const policy = fsConfig.spkDeletionPolicy;
    let readableWindow: string;
    let tooltip: string;

    if (policy === 'immediate') {
      readableWindow = rotationLabel;
      tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel} and are deleted immediately. Message becomes unreadable after key rotation${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared)' : ' unless locally cached'}.`;
    } else if (policy === 'timed') {
      readableWindow = rotationLabel;
      tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel} and retired keys are deleted on the same timer. Readable for up to ~${rotationLabel} after key rotation${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared)' : ' unless locally cached'}.`;
    } else {
      readableWindow = hardDeleteLabel;
      tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel}. Retired keys are kept for up to ${hardDeleteLabel} before deletion. Readable for up to ~${hardDeleteLabel}${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared on rotation)' : ''}.`;
    }

    return { rotationLabel, readableWindow, tooltip };
  }, [fsConfig.securityLevel, fsConfig.spkDeletionPolicy, fsConfig.clearCacheOnRotation]);

  const unreadCount = conversation?.unreadCount ?? 0;

  const messagesById = useMemo(() => {
    const m = new Map<string, DisplayMessage>();
    for (const msg of activeMessages) {
      m.set(msg.id, msg);
    }
    for (const [msgId, msg] of Object.entries(replyParentHydrationMap)) {
      if (!m.has(msgId)) {
        m.set(msgId, msg);
      }
    }
    return m;
  }, [activeMessages, replyParentHydrationMap]);

  const [expiryTick, setExpiryTick] = useState(0);

  useEffect(() => {
    const hasExpiring = reversedMessages.some((m) => m.expiresAt);
    if (!hasExpiring) return;
    const interval = setInterval(() => setExpiryTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [reversedMessages]);

  const flatItems = useMemo(() => {
    const now = Date.now();
    const items: ChatItem[] = [];
    const unreadIdx =
      unreadCount > 0 && unreadCount < reversedMessages.length
        ? reversedMessages.length - unreadCount
        : -1;

    for (let i = 0; i < reversedMessages.length; i++) {
      const msg = reversedMessages[i]!;
      if (msg.expiresAt && new Date(msg.expiresAt).getTime() <= now) continue;

      const currDate = new Date(msg.createdAt);
      const prevItem = items.length > 0 ? items[items.length - 1] : null;
      const prevMsgDate = prevItem?.type === 'message' ? new Date(prevItem.msg.createdAt) : null;
      const showDaySep = !prevMsgDate || !isSameDay(prevMsgDate, currDate);

      if (showDaySep) {
        items.push({ type: 'day-separator', date: currDate, key: `day-${msg.id}` });
      }
      items.push({ type: 'message', msg, key: msg.id, isFirstUnread: i === unreadIdx || undefined });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reversedMessages, unreadCount, expiryTick]);

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

  useLayoutEffect(() => {
    if (messagesLoading) return;
    const anchor = historyScrollAnchorRef.current;
    if (!anchor) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;

    const run = () => {
      const a = historyScrollAnchorRef.current;
      if (!a) return;
      const r = applyHistoryScrollAnchor(vp, content, a);
      if (r === 'missing') historyScrollAnchorRef.current = null;
    };
    run();
    requestAnimationFrame(run);
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [messagesLoading, flatItems.length, id]);

  useEffect(() => {
    if (messagesLoading) return undefined;
    if (!historyScrollAnchorRef.current) return undefined;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return undefined;

    let consecutiveAligned = 0;
    const tick = () => {
      const a = historyScrollAnchorRef.current;
      if (!a) return;
      const r = applyHistoryScrollAnchor(vp, content, a);
      if (r === 'missing') {
        historyScrollAnchorRef.current = null;
        return;
      }
      if (r === 'aligned') {
        consecutiveAligned += 1;
        if (consecutiveAligned >= 2) historyScrollAnchorRef.current = null;
      } else {
        consecutiveAligned = 0;
      }
    };

    const ro = new ResizeObserver(() => {
      tick();
    });
    ro.observe(content);
    tick();

    const t = window.setTimeout(() => {
      historyScrollAnchorRef.current = null;
      ro.disconnect();
    }, 2800);

    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [messagesLoading, flatItems.length, id]);

  // New rows append at the bottom: scrollHeight grows while scrollTop stays fixed, so the viewport no longer
  // shows the latest until we re-pin — must run in layout *after* prepend restoration above.
  useLayoutEffect(() => {
    if (!id) return;
    if (activeConversationId !== id) return;
    const vp = scrollViewportRef.current;
    if (!vp) return;
    if (!isAtBottomRef.current) return;
    vp.scrollTop = vp.scrollHeight - vp.clientHeight;
  }, [messageLayoutKey, id, activeConversationId]);

  /** Snap to latest when opening a conversation without a saved scroll position. Do not gate on isAtBottomRef in
   * the rAF callback: the first scroll event can fire at scrollTop 0 (far from bottom) before we pin, which would
   * clear isAtBottomRef and skip the snap while initialOpenBottomSnapDoneRef is already true. */
  useLayoutEffect(() => {
    if (!id || cachedScrollIndex != null) return;
    if (activeConversationId !== id) return;
    if (flatItems.length === 0 || messagesLoading) return;
    if (pendingScrollToRef.current) return;
    if (urlMessageIdOnConversationEntryRef.current) return;
    if (initialOpenBottomSnapDoneRef.current) return;
    initialOpenBottomSnapDoneRef.current = true;
    const run = () => {
      scrollToBottom('auto');
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [id, activeConversationId, cachedScrollIndex, flatItems.length, messagesLoading, scrollToBottom]);

  const FLASH_HIGHLIGHT_MS = 2800;

  const flashMessageHighlight = useCallback((targetId: string) => {
    setFlashingMessageId(targetId);
    window.setTimeout(() => {
      setFlashingMessageId((prev) => (prev === targetId ? null : prev));
    }, FLASH_HIGHLIGHT_MS);
  }, []);

  const scrollToMessageId = useCallback(
    (targetId: string) => {
      const vp = scrollViewportRef.current;
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(targetId) : targetId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const el = vp?.querySelector(`[data-message-id="${escaped}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        window.setTimeout(() => flashMessageHighlight(targetId), 350);
        return;
      }
      pendingScrollToRef.current = targetId;
      const haveInBuffer = activeMessagesRef.current.some((m) => m.id === targetId);
      if (!haveInBuffer && id) {
        clearConversationScrollCache(id);
        setIsAtBottom(false);
        replyAroundFetchPendingRef.current = true;
        void fetchMessagesAround(id, targetId, {
          before: REPLY_JUMP_CONTEXT_BEFORE,
          after: REPLY_JUMP_CONTEXT_AFTER,
        }).then((ok) => {
          replyAroundFetchPendingRef.current = false;
          if (!ok) pendingScrollToRef.current = null;
        });
      }
    },
    [flashMessageHighlight, id, fetchMessagesAround, setIsAtBottom]
  );

  /**
   * Run pending jump-to-message before paint so the scroll viewport moves to the target
   * before top/bottom intersection observers can fire incremental page loads.
   */
  useLayoutEffect(() => {
    if (!pendingScrollToRef.current) return;
    const pendingId = pendingScrollToRef.current;
    const idx = flatItems.findIndex((i) => i.type === 'message' && i.msg.id === pendingId);
    if (idx >= 0) {
      const vp = scrollViewportRef.current;
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(pendingId)
          : pendingId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      vp?.querySelector(`[data-message-id="${escaped}"]`)?.scrollIntoView({
        block: 'center',
        // Snap immediately so top/bottom sentinels do not fire incremental paging before we land on the target.
        behavior: 'auto',
      });
      pendingScrollToRef.current = null;
      replyAroundFetchPendingRef.current = false;
      window.setTimeout(() => flashMessageHighlight(pendingId), 350);
      return;
    }
    if (messagesLoading || replyAroundFetchPendingRef.current) return;
    pendingScrollToRef.current = null;
  }, [flatItems, messagesLoading, flashMessageHighlight]);

  const deepLinkMessageId = searchParams.get('messageId');
  useEffect(() => {
    if (!deepLinkMessageId || !id) return;
    scrollToMessageId(deepLinkMessageId);
    setSearchParams((prev) => { prev.delete('messageId'); return prev; }, { replace: true });
  }, [deepLinkMessageId, id, scrollToMessageId, setSearchParams]);

  useEffect(() => {
    if (searchParams.get('showSettings') === 'true' && id) {
      setShowSettings(true);
      setSearchParams((prev) => { prev.delete('showSettings'); return prev; }, { replace: true });
    }
  }, [searchParams, id, setSearchParams]);

  // --- Adapter: map conversation types to composer generic interfaces ---

  const checkMessageAchievements = useMessageAchievements();

  const composerSend: ComposerSendFn = useCallback(
    async (plaintext, options) => {
      const hadNewerPages = activeMessagesHasNewerPages;
      const headBefore = activeMessagesRef.current[0]?.id;
      const lastBefore = conversationRef.current?.lastMessageId;
      const atLiveTailBefore =
        !hadNewerPages &&
        (lastBefore == null ? headBefore == null : headBefore === lastBefore);

      const result = await sendTextMessage(id!, plaintext, {
        ...options,
        skipMessageStateUpdate: !atLiveTailBefore,
      });
      if (result && 'errorCode' in result && result.errorCode === 'BLOCKED') {
        setBlockedByOther(true);
        return null;
      }
      if (result && !('errorCode' in result)) {
        checkMessageAchievements(plaintext);
        if (!atLiveTailBefore) {
          clearConversationScrollCache(id!);
          setIsAtBottom(true);
          await jumpToLatestMessages(id!);
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
      id,
      sendTextMessage,
      checkMessageAchievements,
      activeMessagesHasNewerPages,
      jumpToLatestMessages,
      scrollToBottom,
      markJustSent,
      setIsAtBottom,
    ]
  );

  const composerReplyContext: ComposerReplyContext | null = useMemo(() => {
    if (!replyingTo) return null;
    return {
      messageId: replyingTo.id,
      authorName: resolveDisplayName(replyingTo.fromIdentityId, participantProfiles, memberSettings),
      snippet: buildReplySnippet(replyingTo, t as any),
      onCancel: () => setReplyingTo(null),
      onClick: () => scrollToMessageId(replyingTo.id),
    };
  }, [replyingTo, participantProfiles, memberSettings, t, scrollToMessageId]);

  const composerMentionSource: MentionSource | undefined = useMemo(() => {
    if (!conversation) return undefined;
    const users: MentionableUser[] = conversation.participants
      .filter((pid) => pid !== identity?.id)
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
      resolveMentionDisplay: (uid: string) => {
        const nickname = memberSettings[uid]?.nickname;
        if (nickname) return nickname;
        const profile = participantProfiles[uid];
        return profile?.displayName || profile?.username || uid.slice(0, 8);
      },
    };
  }, [conversation, identity?.id, participantProfiles, memberSettings]);

  // --- End adapter ---

  if (!conversation) {
    return (
      <div className="conversation-not-found">
        <p>{t('conversations.notFound', 'Conversation not found')}</p>
        <Link to="/">{t('conversations.backHome', 'Back to home')}</Link>
      </div>
    );
  }

  const otherParticipants = conversation.participants.filter((p) => p !== identity?.id);
  const isDmBlocked = conversation.type === 'dm' && otherParticipants.length === 1 && checkBlocked(otherParticipants[0]!);
  const resolveToolbarName = (pid: string) => {
    const nickname = memberSettings[pid]?.nickname;
    if (nickname) return nickname;
    const profile = participantProfiles[pid];
    return profile?.displayName ?? profile?.username ?? pid;
  };
  const displayName = conversation.type === 'group'
    ? (conversation.decryptedName ?? t('conversations.group', 'Group'))
    : otherParticipants.map(resolveToolbarName).join(', ');
  const subtitle = conversation.type === 'group'
    ? `${conversation.participants.length} ${t('conversations.members', 'members')}`
    : t('conversations.directMessage', 'Direct message');

  const isCurrentUserAdmin = !!(identity?.id && conversation.admins?.includes(identity.id));
  const canEditMemberSettings = conversation.type === 'dm' || isCurrentUserAdmin;
  const isSoleMember = conversation.participants.length <= 1;

  return (
    <div className="conversation-page">
      <div className="conversation-container">
        <ConversationToolbar
          displayName={displayName}
          subtitle={subtitle}
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings((v) => !v)}
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers((v) => !v)}
          isGroup={conversation.type === 'group'}
          isAdmin={isCurrentUserAdmin}
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
              gifsDisabledByAdmin={effectiveGifsDisabled}
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
              gifsDisabled={effectiveGifsDisabled}
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
              gifsDisabledByAdmin={effectiveGifsDisabled}
              onGifsDisabledByAdminToggle={handleGifsDisabledByAdminToggle}
              gifsHiddenForMe={convGifHidden}
              onGifsHiddenForMeToggle={gifsGloballyDisabled ? undefined : setConvGifHidden}
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
