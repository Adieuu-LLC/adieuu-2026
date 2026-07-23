/**
 * Channel view inside a Space — composition root.
 *
 * Wires the extracted feature hooks and adapters, then renders the
 * presentational {@link SpaceChannelToolbar}, {@link SpaceChannelMainPanel},
 * and {@link SpaceMembersSidebar}.
 */

import type { CommunityCipher } from '@adieuu/crypto';
import {
  createApiClient,
  type PublicSpaceMember,
  type PublicSpaceRole,
  type SpaceBanDuration,
} from '@adieuu/shared';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import { createSpacePinsAdapter } from '../../hooks/adapters/spacePinsAdapter';
import { createSpaceReactionsAdapter } from '../../hooks/adapters/spaceReactionsAdapter';
import { createSpaceReplyAdapter } from '../../hooks/adapters/spaceReplyAdapter';
import { useSpaceChannelComposer } from '../../hooks/spaces/useSpaceChannelComposer';
import { useSpaceChannelMembers } from '../../hooks/spaces/useSpaceChannelMembers';
import { useSpaceChannelMessageActions } from '../../hooks/spaces/useSpaceChannelMessageActions';
import { useSpaceChannelMessages } from '../../hooks/spaces/useSpaceChannelMessages';
import { useSpaceChannelScrollToMessage } from '../../hooks/spaces/useSpaceChannelScrollToMessage';
import { useChannelPins } from '../../hooks/useChannelPins';
import { useChannelReactions } from '../../hooks/useChannelReactions';
import { useCipherStore } from '../../hooks/useCipherStore';
import { useFavoriteEmojis } from '../../hooks/useFavoriteEmojis';
import { useIdentity } from '../../hooks/useIdentity';
import { useMemberColorPreference } from '../../hooks/useMemberColorPreference';
import { useMessageScroll } from '../../hooks/useMessageScroll';
import { useMessageScrollOrchestration } from '../../hooks/useMessageScrollOrchestration';
import { buildChannelReplyQuote, useReplyParentHydration } from '../../hooks/useReplyParentHydration';
import { useSpaces } from '../../hooks/useSpaces';
import { useViewportReactionFetch } from '../../hooks/useViewportReactionFetch';
import { useOptionalVoiceChannelSession } from '../../hooks/useVoiceChannelSession';
import {
  bumpCipherLinkEpoch,
  getChannelCipherLink,
  getCipherLinkEpoch,
  getSpaceCipherLink,
  subscribeCipherLinks,
} from '../../services/spaceCipherService';
import { scrollViewportCanScroll } from '../../utils/messageScrollUtils';
import type { ReplyQuotePayload } from '../conversations/conversationUtils';
import { SpaceChannelMainPanel } from './SpaceChannelMainPanel';
import { SpaceChannelToolbar } from './SpaceChannelToolbar';
import { SpaceMembersSidebar } from './SpaceMembersSidebar';
import { type DecryptableMessage, decryptBody } from './spaceChannelCipher';
import { resolveLatestPinInfo } from './spaceChannelViewModel';
import { resolveChannelDisplayName, resolveRoleDisplayName } from './spaceMetadataCipher';
import { useSpaceSenderModeration } from './useSpaceSenderModeration';

export function SpaceChannelView() {
  const { t } = useTranslation();
  const { slug, channelId } = useParams<{ slug: string; channelId: string }>();
  const { apiBaseUrl } = useAppConfig();
  const toast = useToast();
  const {
    activeSpace,
    activeSpaceLoading,
    channels,
    activeChannelId,
    activeMessages,
    activeMessagesLoading,
    activeMessagesOlderCursor,
    activeMessagesHasNewerPages,
    sending,
    participantProfiles,
    resolveProfiles,
    setActiveChannel,
    sendMessage,
    loadOlderMessages,
    loadNewerMessages,
    jumpToLatestMessages,
    fetchMessagesAround,
    trimActiveChannelBuffer,
    registerSocketCallbacks,
    isActiveSpaceMember,
    hasActiveSpacePermission,
    activeSpaceRoleIds,
    activeSpacePermissions,
    isActiveSpaceAdmin,
  } = useSpaces();

  const { identity } = useIdentity();
  const { getCipherKey } = useCipherStore();
  const memberColorDisplay = useMemberColorPreference();
  const cipherLinkEpoch = useSyncExternalStore(
    subscribeCipherLinks,
    getCipherLinkEpoch,
    getCipherLinkEpoch,
  );

  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }),
    [apiBaseUrl],
  );

  // ---------------------------------------------------------------------------
  // Channel activation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (channelId) {
      setActiveChannel(channelId);
    }
    return () => {
      setActiveChannel(null);
    };
  }, [channelId, setActiveChannel]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === channelId) ?? null,
    [channels, channelId],
  );

  const voiceSession = useOptionalVoiceChannelSession();
  const isInVoice =
    !!voiceSession?.joined &&
    voiceSession.joined.channelId === channelId &&
    voiceSession.joined.spaceId === activeSpace?.id;

  // ---------------------------------------------------------------------------
  // Cipher
  // ---------------------------------------------------------------------------

  const isEncrypted = !!(activeSpace?.e2ee || activeChannel?.cipherCheck);

  const spaceCipher: CommunityCipher | null = useMemo(() => {
    if (!isEncrypted || !activeSpace) return null;
    const localCipherId =
      (channelId ? getChannelCipherLink(channelId) : null) ??
      getSpaceCipherLink(activeSpace.id);
    if (!localCipherId) return null;
    return getCipherKey(localCipherId);
  }, [isEncrypted, activeSpace, channelId, getCipherKey, cipherLinkEpoch]);

  const encryptedFallback = t('spaces.channel.encryptedUnavailable', '[Encrypted message]');

  const decryptContent = useCallback(
    (msg: DecryptableMessage | undefined) => decryptBody(msg, spaceCipher, encryptedFallback),
    [spaceCipher, encryptedFallback],
  );

  // ---------------------------------------------------------------------------
  // Channel messages (decrypt + flat items)
  // ---------------------------------------------------------------------------

  const spaceId = activeSpace?.id ?? '';

  const { channelMessages, messageLayoutKey, flatItems, visibleMessageCount } =
    useSpaceChannelMessages({ channelId, activeMessages, spaceCipher, decryptContent });

  // ---------------------------------------------------------------------------
  // Reactions
  // ---------------------------------------------------------------------------

  const reactionsAdapter = useMemo(
    () => createSpaceReactionsAdapter(api, spaceId),
    [api, spaceId],
  );

  const {
    getGroupedReactions,
    onReact,
    onToggleReaction,
    fetchReactions,
    ingestSocketReaction,
    ingestSocketReactionRemoval,
  } = useChannelReactions(channelId, reactionsAdapter, identity?.id);

  // ---------------------------------------------------------------------------
  // Pins
  // ---------------------------------------------------------------------------

  const pinsAdapter = useMemo(
    () => createSpacePinsAdapter(api, spaceId, decryptContent),
    [api, spaceId, decryptContent],
  );

  const canManagePins = hasActiveSpacePermission('pinMessages');

  const {
    pinnedMessageIds,
    pinnedMessageIdsKey,
    pinnedCount,
    onPin,
    onUnpin,
    loadPinnedMessagesPage,
    ingestSocketPinChange,
  } = useChannelPins(channelId, pinsAdapter, canManagePins);

  // ---------------------------------------------------------------------------
  // Wire socket callbacks for reactions + pins
  // ---------------------------------------------------------------------------

  useEffect(() => {
    registerSocketCallbacks({
      onReactionAdded: ingestSocketReaction,
      onReactionRemoved: ingestSocketReactionRemoval,
      onPinsUpdated: ingestSocketPinChange,
    });
    return () => {
      registerSocketCallbacks({});
    };
  }, [registerSocketCallbacks, ingestSocketReaction, ingestSocketReactionRemoval, ingestSocketPinChange]);

  // ---------------------------------------------------------------------------
  // Reply parent hydration
  // ---------------------------------------------------------------------------

  const replyAdapter = useMemo(
    () => createSpaceReplyAdapter(api, spaceId, decryptContent),
    [api, spaceId, decryptContent],
  );

  const { getParentInfo, hydrateAll, hydratedParents } = useReplyParentHydration(
    channelId,
    channelMessages,
    replyAdapter,
  );

  useEffect(() => {
    if (channelMessages.length > 0) {
      hydrateAll(channelMessages);
    }
  }, [channelMessages, hydrateAll]);

  useEffect(() => {
    const authorIds = new Set<string>();
    for (const parent of Object.values(hydratedParents)) {
      if (parent.fromIdentityId) authorIds.add(parent.fromIdentityId);
    }
    for (const msg of channelMessages) {
      if (msg.replyToMessageId) {
        const parent = getParentInfo(msg.replyToMessageId);
        if (parent?.fromIdentityId) authorIds.add(parent.fromIdentityId);
      }
    }
    const missing = [...authorIds].filter((id) => !participantProfiles[id]);
    if (missing.length > 0) resolveProfiles(missing);
  }, [hydratedParents, channelMessages, getParentInfo, participantProfiles, resolveProfiles]);

  // ---------------------------------------------------------------------------
  // Scroll-to-message (pins, reply quotes)
  // ---------------------------------------------------------------------------

  const { flashingMessageId, scrollToMessageId, scrollViewportRefStable, pendingScrollToRef } =
    useSpaceChannelScrollToMessage({
      channelId,
      activeMessages,
      activeMessagesLoading,
      flatItems,
      fetchMessagesAround,
    });

  const replyQuoteBuilder = useCallback(
    (msg: import('../../components/messaging/channelMessage').ChannelMessage): ReplyQuotePayload | null => {
      if (!msg.replyToMessageId) return null;
      const parentInfo = getParentInfo(msg.replyToMessageId);
      return buildChannelReplyQuote(
        parentInfo,
        (id) => {
          const p = participantProfiles[id];
          return p?.displayName ?? p?.username ?? id.slice(0, 8);
        },
        (id) => participantProfiles[id]?.avatarUrl,
        () => {
          if (msg.replyToMessageId) scrollToMessageId(msg.replyToMessageId);
        },
        t('conversations.replyDeleted', 'Message deleted'),
        t('conversations.replyOriginal', 'Original message'),
      );
    },
    [getParentInfo, participantProfiles, t, scrollToMessageId],
  );

  // ---------------------------------------------------------------------------
  // Message actions (reply, edit, delete, edit history)
  // ---------------------------------------------------------------------------

  const {
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
  } = useSpaceChannelMessageActions({
    spaceId,
    channelId,
    isEncrypted,
    spaceCipher,
    participantProfiles,
    api,
    t,
    showError: (msg) => toast.error(msg),
  });

  // ---------------------------------------------------------------------------
  // Scroll
  // ---------------------------------------------------------------------------

  const handleLoadOlder = useCallback(() => {
    void loadOlderMessages();
  }, [loadOlderMessages]);

  const handleLoadNewer = useCallback(() => {
    void loadNewerMessages();
  }, [loadNewerMessages]);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const jumpInFlightRef = useRef(false);
  const historyAnchorActiveRef = useRef(false);

  const {
    scrollViewportRef,
    messagesContentRef,
    messagesContainerRef,
    isAtBottomRef,
    showScrollButton,
    scrollToBottom,
    pinToBottom,
    markJustSent,
    cachedScrollIndex,
    onScrollViewportScroll,
    onUserScrollIntent,
  } = useMessageScroll({
    entityId: channelId,
    setIsAtBottom,
    messageLayoutKey,
    historyAnchorActiveRef,
  });

  // ---------------------------------------------------------------------------
  // Composer (send / edit submission)
  // ---------------------------------------------------------------------------

  const { onSend } = useSpaceChannelComposer({
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
  });

  const wrappedSend: import('../../components/composer/composerTypes').ComposerSendFn = useCallback(
    async (payload, options) => {
      const outcome = await onSend(payload, options);
      if (outcome) markJustSent();
      return outcome;
    },
    [onSend, markJustSent],
  );

  const handleJumpReload = useCallback(
    async (id: string) => {
      jumpInFlightRef.current = true;
      try {
        await jumpToLatestMessages(id);
      } finally {
        jumpInFlightRef.current = false;
      }
    },
    [jumpToLatestMessages],
  );

  scrollViewportRefStable.current = scrollViewportRef.current;

  useViewportReactionFetch({
    entityId: channelId,
    scrollViewportRef,
    fetchReactions,
    ready: flatItems.length > 0,
  });

  const {
    handleReachOlder,
    handleReachNewer,
    handleJumpToLatest,
  } = useMessageScrollOrchestration({
    entityId: channelId,
    activeEntityId: activeChannelId,
    messageLayoutKey,
    flatItems,
    messagesLoading: activeMessagesLoading,
    hasOlderCursor: !!activeMessagesOlderCursor,
    hasNewerPages: activeMessagesHasNewerPages,
    loadOlder: handleLoadOlder,
    loadNewer: handleLoadNewer,
    jumpToLatest: handleJumpReload,
    headMessageId: activeMessages[0]?.id,
    scrollViewportRef,
    messagesContentRef,
    isAtBottomRef,
    scrollToBottom,
    setIsAtBottom,
    pinToBottom,
    historyAnchorActiveRef,
    cachedScrollIndex,
  });

  const [showManualLoadOlder, setShowManualLoadOlder] = useState(false);
  useEffect(() => {
    const vp = scrollViewportRef.current;
    if (!vp || !activeMessagesOlderCursor || activeMessagesLoading) {
      setShowManualLoadOlder(false);
      return;
    }
    setShowManualLoadOlder(!scrollViewportCanScroll(vp));
  }, [activeMessagesOlderCursor, activeMessagesLoading, flatItems.length, scrollViewportRef]);

  useEffect(() => {
    if (pendingScrollToRef.current || jumpInFlightRef.current) return;
    trimActiveChannelBuffer(isAtBottom);
  }, [isAtBottom, activeMessages.length, trimActiveChannelBuffer]);

  // ---------------------------------------------------------------------------
  // Members pane + nickname/colour settings for chat
  // ---------------------------------------------------------------------------

  const [showMembers, setShowMembers] = useState(false);
  const toggleMembers = useCallback(() => setShowMembers((v) => !v), []);

  const {
    memberRoles,
    memberSettings,
    spaceMembersById,
    upsertSpaceMembers,
    removeSpaceMember,
    handleSidebarMembersChange,
  } = useSpaceChannelMembers({
    spaceId,
    api,
    resolveProfiles,
  });

  const resolveRoleName = useCallback(
    (role: PublicSpaceRole) =>
      resolveRoleDisplayName(role, spaceCipher, {
        encryptedRole: t('spaces.encryptedRolePlaceholder', 'Encrypted role'),
      }),
    [spaceCipher, t],
  );

  const canKick = hasActiveSpacePermission('kickMembers');
  const canBan = hasActiveSpacePermission('banMembers');
  const canManageMemberRoles = hasActiveSpacePermission('manageMemberRoles');
  const canManageRoles = hasActiveSpacePermission('manageRoles');

  const moderationRemoveMember = useCallback(
    (id: string) => api.spaces.removeMember(spaceId, id),
    [api.spaces, spaceId],
  );
  const moderationBanMember = useCallback(
    (id: string, body: { reason: string; duration: SpaceBanDuration }) =>
      api.spaces.banMember(spaceId, id, body),
    [api.spaces, spaceId],
  );
  const moderationSetMemberRoles = useCallback(
    (id: string, roleIds: string[]) => api.spaces.setMemberRoles(spaceId, id, roleIds),
    [api.spaces, spaceId],
  );
  const moderationMemberUpdated = useCallback(
    (updated: PublicSpaceMember) => upsertSpaceMembers([updated]),
    [upsertSpaceMembers],
  );

  const wrapSenderIdentity = useSpaceSenderModeration({
    spaceId,
    selfId: identity?.id,
    ownerIdentityId: activeSpace?.ownerIdentityId,
    actorPermissions: activeSpacePermissions,
    memberRoles,
    spaceMembersById,
    canKick,
    canBan,
    canManageMemberRoles,
    canManageRoles,
    actorIsAdmin: isActiveSpaceAdmin,
    resolveRoleName,
    removeMember: moderationRemoveMember,
    banMember: moderationBanMember,
    setMemberRoles: moderationSetMemberRoles,
    onMemberUpdated: moderationMemberUpdated,
    onMemberRemoved: removeSpaceMember,
  });

  // ---------------------------------------------------------------------------
  // Pin preview for toolbar subtitle
  // ---------------------------------------------------------------------------

  const latestPinInfo = useMemo(
    () => resolveLatestPinInfo(channelMessages, pinnedMessageIds, pinnedCount, t),
    [channelMessages, pinnedMessageIds, pinnedCount, t],
  );

  // ---------------------------------------------------------------------------
  // Favorite emojis
  // ---------------------------------------------------------------------------

  const { favorites: favoriteEmojis, addFavorite, removeFavorite } = useFavoriteEmojis(identity?.id);

  // ---------------------------------------------------------------------------
  // Report (stub)
  // ---------------------------------------------------------------------------

  const noopReport = useCallback(() => {}, []);

  const handleLinkClick = useCallback((href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!activeChannel) {
    // After the Space finishes loading, a missing/inaccessible channel means
    // the saved last-channel is stale — fall back to Space Home.
    if (!activeSpaceLoading && activeSpace && channelId && slug) {
      try {
        localStorage.removeItem(`adieuu:lastChannel:${activeSpace.id}`);
      } catch {
        /* quota / SSR */
      }
      return <Navigate to={`/s/${slug}`} replace />;
    }
    return (
      <div className="space-channel-loading">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-channel-view">
      <SpaceChannelToolbar
        channelName={resolveChannelDisplayName(activeChannel, spaceCipher, {
          encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
        })}
        isEncrypted={isEncrypted}
        memberCount={activeSpace?.memberCount ?? 0}
        latestPinInfo={latestPinInfo}
        scrollToMessageId={scrollToMessageId}
        channelId={channelId!}
        pinnedCount={pinnedCount}
        pinnedMessageIdsKey={pinnedMessageIdsKey}
        loadPinnedMessagesPage={loadPinnedMessagesPage}
        onUnpin={async (msgId) => { await onUnpin(msgId); }}
        canManagePins={canManagePins}
        participantProfiles={participantProfiles}
        memberSettings={memberSettings}
        identity={identity}
        showMembers={showMembers}
        onToggleMembers={toggleMembers}
        isVoiceChannel={activeChannel.type === 'voice'}
        isInVoice={isInVoice}
        onToggleVoice={
          activeChannel.type === 'voice' && activeSpace && voiceSession
            ? () => {
                if (isInVoice) {
                  void voiceSession.leaveVoiceChannel();
                } else {
                  void voiceSession.joinVoiceChannel(activeSpace.id, activeChannel.id);
                }
              }
            : undefined
        }
        t={t}
      />

      <div className="space-channel-content-row">
      <div className="space-channel-content">
        <SpaceChannelMainPanel
          channelId={channelId}
          activeChannelId={activeChannelId}
          flatItems={flatItems}
          messagesLoading={activeMessagesLoading}
          visibleMessageCount={visibleMessageCount}
          identity={identity}
          participantProfiles={participantProfiles}
          memberSettings={memberSettings}
          memberColorDisplay={memberColorDisplay}
          favoriteEmojis={favoriteEmojis}
          getGroupedReactions={getGroupedReactions}
          onDeleteMessage={handleDeleteMessage}
          onReact={onReact}
          onToggleReaction={onToggleReaction}
          onReportMessage={noopReport}
          onAddFavorite={addFavorite}
          onRemoveFavorite={removeFavorite}
          onLinkClick={handleLinkClick}
          showScrollButton={showScrollButton}
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
          showManualLoadOlder={showManualLoadOlder}
          onManualLoadOlder={handleReachOlder}
          pinnedMessageIds={pinnedMessageIds}
          canManagePins={canManagePins}
          onPinMessage={(msgId) => void onPin(msgId)}
          onUnpinMessage={(msgId) => void onUnpin(msgId)}
          onReply={handleReply}
          onStartEdit={handleStartEdit}
          replyQuoteBuilder={replyQuoteBuilder}
          scrollToMessageId={scrollToMessageId}
          flashingMessageId={flashingMessageId}
          loadEditHistory={loadEditHistory}
          isEncrypted={isEncrypted}
          spaceCipher={spaceCipher}
          cipherGate={
            isEncrypted && activeSpace && (activeChannel?.cipherCheck ?? activeSpace.cipherCheck)
              ? {
                  spaceId: activeSpace.id,
                  channelId: activeChannel?.id,
                  cipherCheck: (activeChannel?.cipherCheck ?? activeSpace.cipherCheck)!,
                  onCipherLinked: bumpCipherLinkEpoch,
                }
              : null
          }
          isMember={isActiveSpaceMember}
          sending={sending}
          wrappedSend={wrappedSend}
          replyContext={replyContext}
          editingMessage={editingMessage}
          setEditingMessage={setEditingMessage}
          editingInitialPlaintext={editingInitialPlaintext}
          editingInitialAttachments={editingInitialAttachments}
          wrapSenderIdentity={wrapSenderIdentity}
          t={t}
        />
      </div>

      {showMembers && (
        <SpaceMembersSidebar
          spaceId={spaceId}
          roles={memberRoles}
          selfId={identity?.id}
          actorRoleIds={activeSpaceRoleIds}
          actorPermissions={activeSpacePermissions}
          ownerIdentityId={activeSpace?.ownerIdentityId}
          canChangeNickname={hasActiveSpacePermission('changeNickname')}
          canManageNicknames={hasActiveSpacePermission('manageNicknames')}
          canKick={canKick}
          canBan={canBan}
          canManageMemberRoles={canManageMemberRoles}
          canManageRoles={canManageRoles}
          actorIsAdmin={isActiveSpaceAdmin}
          listMembers={(sid, opts) => api.spaces.listMembers(sid, opts)}
          updateMemberProfile={(sid, identityId, body) =>
            api.spaces.updateMemberProfile(sid, identityId, body)
          }
          removeMember={(sid, identityId) => api.spaces.removeMember(sid, identityId)}
          banMember={(sid, identityId, body) => api.spaces.banMember(sid, identityId, body)}
          setMemberRoles={(sid, identityId, roleIds) =>
            api.spaces.setMemberRoles(sid, identityId, roleIds)
          }
          resolveProfile={(id) => participantProfiles[id]}
          resolveRoleName={resolveRoleName}
          onMembersChange={handleSidebarMembersChange}
          onClose={toggleMembers}
        />
      )}
      </div>
    </div>
  );
}
