/**
 * Channel view inside a Space — composition root.
 *
 * Wires the extracted feature hooks and adapters, then renders the
 * presentational {@link SpaceChannelToolbar}, {@link SpaceChannelMainPanel},
 * and {@link SpaceMembersSidebar}.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CommunityCipher } from '@adieuu/crypto';
import { createApiClient, type PublicSpaceRole } from '@adieuu/shared';
import { useSpaces } from '../../hooks/useSpaces';
import { useIdentity } from '../../hooks/useIdentity';
import { useAppConfig } from '../../config';
import { useCipherStore } from '../../hooks/useCipherStore';
import {
  getChannelCipherLink,
  getSpaceCipherLink,
} from '../../services/spaceCipherService';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { SpaceMembersSidebar } from './SpaceMembersSidebar';
import { useMessageScroll } from '../../hooks/useMessageScroll';
import { useMessageScrollOrchestration } from '../../hooks/useMessageScrollOrchestration';
import { useViewportReactionFetch } from '../../hooks/useViewportReactionFetch';
import { useChannelReactions } from '../../hooks/useChannelReactions';
import { createSpaceReactionsAdapter } from '../../hooks/adapters/spaceReactionsAdapter';
import { useFavoriteEmojis } from '../../hooks/useFavoriteEmojis';
import { useChannelPins } from '../../hooks/useChannelPins';
import { createSpacePinsAdapter } from '../../hooks/adapters/spacePinsAdapter';
import { useReplyParentHydration, buildChannelReplyQuote } from '../../hooks/useReplyParentHydration';
import { createSpaceReplyAdapter } from '../../hooks/adapters/spaceReplyAdapter';
import { scrollViewportCanScroll } from '../../utils/messageScrollUtils';
import type { ReplyQuotePayload } from '../conversations/conversationUtils';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';

import { decryptBody, type DecryptableMessage } from './spaceChannelCipher';
import { resolveChannelDisplayName } from './spaceMetadataCipher';
import { resolveLatestPinInfo } from './spaceChannelViewModel';
import { useSpaceChannelMessages } from '../../hooks/spaces/useSpaceChannelMessages';
import { useSpaceChannelScrollToMessage } from '../../hooks/spaces/useSpaceChannelScrollToMessage';
import { useSpaceChannelMessageActions } from '../../hooks/spaces/useSpaceChannelMessageActions';
import { useSpaceChannelComposer } from '../../hooks/spaces/useSpaceChannelComposer';
import { SpaceChannelToolbar } from './SpaceChannelToolbar';
import { SpaceChannelMainPanel } from './SpaceChannelMainPanel';

const EMPTY_MEMBER_SETTINGS: MemberSettingsMap = {};

export function SpaceChannelView() {
  const { t } = useTranslation();
  const { channelId } = useParams<{ channelId: string }>();
  const { apiBaseUrl } = useAppConfig();
  const toast = useToast();
  const {
    activeSpace,
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
  } = useSpaces();

  const { identity } = useIdentity();
  const { getCipherKey } = useCipherStore();
  const [cipherLinkVersion, setCipherLinkVersion] = useState(0);
  const [memberRoles, setMemberRoles] = useState<PublicSpaceRole[]>([]);

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
    // cipherLinkVersion forces re-resolve after bookmark/detect recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional bump
  }, [isEncrypted, activeSpace, channelId, getCipherKey, cipherLinkVersion]);

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
  // Members pane
  // ---------------------------------------------------------------------------

  const [showMembers, setShowMembers] = useState(false);
  const toggleMembers = useCallback(() => setShowMembers((v) => !v), []);

  useEffect(() => {
    if (!showMembers || !spaceId) {
      setMemberRoles([]);
      return;
    }
    let cancelled = false;
    void api.spaces.listRoles(spaceId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setMemberRoles(res.data.roles);
      } else {
        setMemberRoles([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showMembers, spaceId, api]);

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
        memberSettings={EMPTY_MEMBER_SETTINGS}
        identity={identity}
        showMembers={showMembers}
        onToggleMembers={toggleMembers}
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
          memberSettings={EMPTY_MEMBER_SETTINGS}
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
                  onCipherLinked: () => setCipherLinkVersion((v) => v + 1),
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
          t={t}
        />
      </div>

      {showMembers && (
        <SpaceMembersSidebar
          spaceId={spaceId}
          roles={memberRoles}
          selfId={identity?.id}
          listMembers={(sid, opts) => api.spaces.listMembers(sid, opts)}
          resolveProfile={(id) => participantProfiles[id]}
          onClose={toggleMembers}
        />
      )}
      </div>
    </div>
  );
}
