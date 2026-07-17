/**
 * Channel view inside a Space.
 *
 * Displays messages for a single text channel using the shared
 * {@link ChannelMessageList} and {@link ChannelMessageBubble}.
 * When the Space or channel has a `cipherCheck`, messages are encrypted
 * locally with the matching Community Cipher before sending and decrypted
 * on display.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  decryptWithCipher,
  deserializeCipherPayload,
  encryptWithCipher,
  fromBytes,
  serializeCipherPayload,
  toBytes,
  type CommunityCipher,
  type SerializedCipherPayload,
} from '@adieuu/crypto';
import { createApiClient } from '@adieuu/shared';
import { useSpaces } from '../../hooks/useSpaces';
import { useIdentity } from '../../hooks/useIdentity';
import { useAppConfig } from '../../config';
import { useCipherStore } from '../../hooks/useCipherStore';
import { getSpaceCipherLink } from '../../services/spaceCipherService';
import { parsePayload } from '../../services/messagePayload';
import { Spinner } from '../../components/Spinner';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { MessageComposer } from '../../components/composer/MessageComposer';
import type { ComposerSendFn, ComposerReplyContext } from '../../components/composer/composerTypes';
import {
  spaceMessageToChannel,
  type ChannelMessage,
} from '../../components/messaging/channelMessage';
import { ChannelMessageList } from '../../components/messaging/ChannelMessageList';
import { ChannelPinsMenu } from '../../components/messaging/ChannelPinsMenu';
import { buildFlatMessageItems, type ChannelListItem } from '../../utils/buildFlatMessageItems';
import { SpaceMembersSidebar } from './SpaceMembersSidebar';
import { useMessageScroll } from '../../hooks/useMessageScroll';
import { useMessageScrollOrchestration } from '../../hooks/useMessageScrollOrchestration';
import { useChannelReactions } from '../../hooks/useChannelReactions';
import { createSpaceReactionsAdapter } from '../../hooks/adapters/spaceReactionsAdapter';
import { useFavoriteEmojis } from '../../hooks/useFavoriteEmojis';
import { useChannelPins } from '../../hooks/useChannelPins';
import { createSpacePinsAdapter } from '../../hooks/adapters/spacePinsAdapter';
import { useReplyParentHydration, buildChannelReplyQuote } from '../../hooks/useReplyParentHydration';
import { createSpaceReplyAdapter } from '../../hooks/adapters/spaceReplyAdapter';
import type { PublicSpaceMessage } from '@adieuu/shared';
import type { ReplyQuotePayload } from '../conversations/conversationUtils';
import type { EditHistoryEntry } from '../../components/messaging/EditHistoryLabel';

function decryptBody(
  content: string | undefined,
  cipher: CommunityCipher | null | undefined,
): string {
  if (!content) return '';
  if (cipher) {
    try {
      const parsed = JSON.parse(content) as SerializedCipherPayload;
      if (parsed.ciphertext && parsed.nonce && parsed.cipherId) {
        const payload = deserializeCipherPayload(parsed);
        return fromBytes(decryptWithCipher(cipher, payload));
      }
    } catch {
      // fall through
    }
  }
  return content;
}

export function SpaceChannelView() {
  const { t } = useTranslation();
  const { channelId } = useParams<{ channelId: string }>();
  const { apiBaseUrl } = useAppConfig();
  const {
    activeSpace,
    channels,
    activeChannelId,
    activeMessages,
    activeMessagesLoading,
    activeMessagesOlderCursor,
    sending,
    participantProfiles,
    setActiveChannel,
    sendMessage,
    loadOlderMessages,
    registerSocketCallbacks,
  } = useSpaces();

  const { identity } = useIdentity();
  const { getCipherKey } = useCipherStore();

  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }),
    [apiBaseUrl],
  );

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

  const isEncrypted = !!(activeSpace?.cipherCheck || activeChannel?.cipherCheck);

  const spaceCipher: CommunityCipher | null = useMemo(() => {
    if (!isEncrypted || !activeSpace) return null;
    const localCipherId = getSpaceCipherLink(activeSpace.id);
    if (!localCipherId) return null;
    return getCipherKey(localCipherId);
  }, [isEncrypted, activeSpace, getCipherKey]);

  const decryptContent = useCallback(
    (content: string | undefined) => decryptBody(content, spaceCipher),
    [spaceCipher],
  );

  // ---------------------------------------------------------------------------
  // Channel messages
  // ---------------------------------------------------------------------------

  const channelMessages: ChannelMessage[] = useMemo(() => {
    const chronological = [...activeMessages].reverse();
    return chronological.map((msg: PublicSpaceMessage) => {
      const body = decryptContent(msg.content);
      return spaceMessageToChannel(msg, body);
    });
  }, [activeMessages, decryptContent]);

  const messageLayoutKey = useMemo(
    () => channelMessages.map((m) => m.id).join(','),
    [channelMessages],
  );

  const [expiryTick, setExpiryTick] = useState(0);

  useEffect(() => {
    const hasExpiring = channelMessages.some((m) => m.expiresAt);
    if (!hasExpiring) return;
    const timer = setInterval(() => setExpiryTick((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, [channelMessages]);

  const flatItems: ChannelListItem<ChannelMessage>[] = useMemo(
    () => buildFlatMessageItems(channelMessages, 0, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelMessages, expiryTick],
  );

  // ---------------------------------------------------------------------------
  // Reactions
  // ---------------------------------------------------------------------------

  const spaceId = activeSpace?.id ?? '';

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

  const prevMessageIdsRef = useRef<string>('');
  useEffect(() => {
    const ids = channelMessages.map((m) => m.id).join(',');
    if (ids && ids !== prevMessageIdsRef.current) {
      prevMessageIdsRef.current = ids;
      void fetchReactions(channelMessages.map((m) => m.id));
    }
  }, [channelMessages, fetchReactions]);

  // ---------------------------------------------------------------------------
  // Pins
  // ---------------------------------------------------------------------------

  const pinsAdapter = useMemo(
    () => createSpacePinsAdapter(api, spaceId, decryptContent),
    [api, spaceId, decryptContent],
  );

  // TODO: determine canManagePins from member role
  const canManagePins = true;

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

  const { getParentInfo, hydrateAll } = useReplyParentHydration(
    channelId,
    channelMessages,
    replyAdapter,
  );

  useEffect(() => {
    if (channelMessages.length > 0) {
      hydrateAll(channelMessages);
    }
  }, [channelMessages, hydrateAll]);

  // ---------------------------------------------------------------------------
  // Scroll to specific message (pins, reply quotes)
  // ---------------------------------------------------------------------------

  const FLASH_HIGHLIGHT_MS = 2800;
  const [flashingMessageId, setFlashingMessageId] = useState<string | null>(null);
  const scrollViewportRefStable = useRef<HTMLDivElement | null>(null);

  const scrollToMessageId = useCallback(
    (messageId: string) => {
      const el = scrollViewportRefStable.current?.querySelector(`[data-message-id="${messageId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setFlashingMessageId(messageId);
        setTimeout(() => setFlashingMessageId(null), FLASH_HIGHLIGHT_MS);
      }
    },
    [],
  );

  const replyQuoteBuilder = useCallback(
    (msg: ChannelMessage): ReplyQuotePayload | null => {
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
  // Reply context for composer
  // ---------------------------------------------------------------------------

  const [replyContext, setReplyContext] = useState<ComposerReplyContext | null>(null);

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

  // ---------------------------------------------------------------------------
  // Edit / Delete
  // ---------------------------------------------------------------------------

  const [editingMessage, setEditingMessage] = useState<ChannelMessage | null>(null);

  const handleStartEdit = useCallback((msg: ChannelMessage) => {
    if (msg.revisionCount >= 3) {
      // MAX_EDITS_REACHED — matches backend limit
      return;
    }
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

  // ---------------------------------------------------------------------------
  // Send / Edit submission
  // ---------------------------------------------------------------------------

  const onSend: ComposerSendFn = useCallback(
    async (composerPayload: string, options?) => {
      const parsed = parsePayload(composerPayload);
      const hasContent = !!parsed.text || parsed.gifAttachments.length > 0;
      if (!hasContent) return;

      if (editingMessage) {
        if (!spaceId || !channelId) return;
        let content = parsed.isStructured ? composerPayload : parsed.text;
        if (isEncrypted && spaceCipher) {
          const encrypted = encryptWithCipher(spaceCipher, toBytes(content));
          content = JSON.stringify(serializeCipherPayload(encrypted));
        }
        await api.spaces.editMessage(spaceId, channelId, editingMessage.id, content);
        setEditingMessage(null);
        return;
      }

      const replyToMessageId = replyContext?.messageId;
      const mentionedIdentityIds = parsed.mentions
        .map((m) => m.id)
        .filter((id): id is string => !!id);
      const expiresInSeconds = options?.expiresInSeconds;

      const content = parsed.isStructured ? composerPayload : parsed.text;

      if (isEncrypted && spaceCipher) {
        const encrypted = encryptWithCipher(spaceCipher, toBytes(content));
        const serialized = serializeCipherPayload(encrypted);
        await sendMessage(
          JSON.stringify(serialized),
          replyToMessageId,
          mentionedIdentityIds.length ? mentionedIdentityIds : undefined,
          expiresInSeconds,
        );
      } else {
        await sendMessage(
          content,
          replyToMessageId,
          mentionedIdentityIds.length ? mentionedIdentityIds : undefined,
          expiresInSeconds,
        );
      }
      setReplyContext(null);
    },
    [sendMessage, isEncrypted, spaceCipher, editingMessage, api, spaceId, channelId, replyContext],
  );

  // ---------------------------------------------------------------------------
  // Scroll
  // ---------------------------------------------------------------------------

  const handleLoadOlder = useCallback(() => {
    void loadOlderMessages();
  }, [loadOlderMessages]);

  const [, setIsAtBottom] = useState(true);

  const {
    scrollViewportRef,
    messagesContentRef,
    messagesContainerRef,
    isAtBottomRef,
    showScrollButton,
    scrollToBottom,
    markJustSent,
    cachedScrollIndex,
    onScrollViewportScroll,
    onUserScrollIntent,
  } = useMessageScroll({
    entityId: channelId,
    setIsAtBottom,
    messageLayoutKey,
  });

  scrollViewportRefStable.current = scrollViewportRef.current;

  const {
    handleReachOlder,
    handleReachNewer: _handleReachNewer,
    handleJumpToLatest,
  } = useMessageScrollOrchestration({
    entityId: channelId,
    activeEntityId: activeChannelId,
    messageLayoutKey,
    flatItems,
    messagesLoading: activeMessagesLoading,
    hasOlderCursor: !!activeMessagesOlderCursor,
    hasNewerPages: false,
    loadOlder: handleLoadOlder,
    loadNewer: () => {},
    scrollViewportRef,
    messagesContentRef,
    isAtBottomRef,
    scrollToBottom,
    setIsAtBottom,
    cachedScrollIndex,
  });

  // ---------------------------------------------------------------------------
  // Members pane
  // ---------------------------------------------------------------------------

  const [showMembers, setShowMembers] = useState(false);
  const toggleMembers = useCallback(() => setShowMembers((v) => !v), []);

  // ---------------------------------------------------------------------------
  // Pin preview for toolbar subtitle
  // ---------------------------------------------------------------------------

  const latestPinInfo = useMemo(() => {
    if (pinnedCount === 0) return null;
    const pinned = channelMessages.find((m) => pinnedMessageIds.includes(m.id));
    if (!pinned) return null;
    const { text } = parsePayload(pinned.body);
    const cleaned = text.replace(/\s+/g, ' ').trim();
    const preview = !cleaned
      ? t('conversations.pinnedMessage', 'Pinned')
      : cleaned.length > 70 ? `${cleaned.slice(0, 70)}…` : cleaned;
    return { preview, messageId: pinned.id };
  }, [pinnedCount, channelMessages, pinnedMessageIds, t]);

  // ---------------------------------------------------------------------------
  // Favorite emojis (shared across Conversations and Spaces)
  // ---------------------------------------------------------------------------

  const { favorites: favoriteEmojis, addFavorite, removeFavorite } = useFavoriteEmojis(identity?.id);

  // ---------------------------------------------------------------------------
  // Report (stub)
  // ---------------------------------------------------------------------------

  const noopReport = useCallback(() => {}, []);

  // ---------------------------------------------------------------------------
  // Edit history loader
  // ---------------------------------------------------------------------------

  const loadEditHistory = useCallback(
    async (messageId: string): Promise<EditHistoryEntry[] | null> => {
      if (!spaceId || !channelId) return null;
      try {
        const res = await api.spaces.getMessage(spaceId, channelId, messageId);
        if (!res.success || !res.data) return null;
        const history = (res.data as { revisionHistory?: { content: string; replacedAt: string }[] }).revisionHistory;
        if (!history || history.length === 0) return [];

        return history.map((entry) => {
          let plaintext = entry.content;
          if (isEncrypted && spaceCipher) {
            try {
              const parsed = JSON.parse(entry.content) as SerializedCipherPayload;
              const payload = deserializeCipherPayload(parsed);
              plaintext = fromBytes(decryptWithCipher(spaceCipher, payload));
            } catch {
              return { replacedAt: entry.replacedAt, decryptionError: 'Unable to decrypt' };
            }
          }
          return { replacedAt: entry.replacedAt, plaintext };
        });
      } catch {
        return null;
      }
    },
    [spaceId, channelId, api, isEncrypted, spaceCipher],
  );

  const handleLinkClick = useCallback((href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  const wrappedSend: ComposerSendFn = useCallback(
    async (payload, options) => {
      markJustSent();
      await onSend(payload, options);
    },
    [onSend, markJustSent],
  );

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
      <div className="space-channel-toolbar">
        <div className="space-channel-toolbar-left">
          <span className="space-channel-toolbar-hash">#</span>
          <div className="space-channel-toolbar-info">
            <span className="space-channel-toolbar-name">
              {activeChannel.name}
              {isEncrypted && (
                <span className="spaces-badge spaces-badge--encrypted spaces-badge--toolbar">
                  {t('spaces.encrypted')}
                </span>
              )}
            </span>
            {latestPinInfo ? (
              <button
                type="button"
                className="space-channel-toolbar-subtitle space-channel-toolbar-subtitle--clickable"
                onClick={() => scrollToMessageId(latestPinInfo.messageId)}
              >
                {latestPinInfo.preview}
              </button>
            ) : (
              <span className="space-channel-toolbar-subtitle">
                {`${activeSpace?.memberCount ?? 0} ${t('conversations.members', 'members')}`}
              </span>
            )}
          </div>
        </div>
        <div className="space-channel-toolbar-actions">
          <ChannelPinsMenu
            channelId={channelId!}
            pinnedCount={pinnedCount}
            pinnedMessageIdsKey={pinnedMessageIdsKey}
            loadPinnedMessagesPage={loadPinnedMessagesPage}
            scrollToMessageId={scrollToMessageId}
            onUnpin={async (msgId) => { await onUnpin(msgId); }}
            canUnpin={canManagePins}
            participantProfiles={participantProfiles}
            memberSettings={{}}
            identity={identity}
          />
          <Tooltip content={t('conversations.members', 'Members')} position="bottom">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={`conversation-toolbar-btn conversation-toolbar-btn--icon-only${showMembers ? ' active' : ''}`}
              onClick={toggleMembers}
              aria-label={t('conversations.members', 'Members')}
              aria-pressed={showMembers}
            >
              <span className="conversation-toolbar-btn-icon" aria-hidden>
                <Icon name="users" size="sm" />
              </span>
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="space-channel-content-row">
      <div className="space-channel-content">
      <div className="space-channel-body">
        <ChannelMessageList
          entityId={channelId}
          activeEntityId={activeChannelId}
          flatItems={flatItems}
          messagesLoading={activeMessagesLoading}
          messageCount={activeMessages.length}
          identity={identity}
          participantProfiles={participantProfiles}
          memberSettings={{}}
          messageLayout="linear"
          memberColorDisplay="name-only"
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
          hasNewerPages={false}
          onReachNewer={() => {}}
          emptyMessage={t('spaces.channel.noMessages')}
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
        />
      </div>

      <div className="space-channel-composer">
        {isEncrypted && !spaceCipher ? (
          <div className="space-channel-no-cipher">
            <p className="spaces-state-body">
              {t('spaces.channel.noCipher')}
            </p>
          </div>
        ) : (
          <MessageComposer
            channelId={activeChannelId ?? channelId!}
            sending={sending}
            onSend={wrappedSend}
            replyContext={replyContext}
            editContext={
              editingMessage
                ? {
                    messageId: editingMessage.id,
                    onCancel: () => setEditingMessage(null),
                  }
                : null
            }
            editingMessageKey={editingMessage?.id ?? null}
            editingInitialPlaintext={editingInitialPlaintext}
            editingInitialAttachments={editingInitialAttachments}
          />
        )}
      </div>
      </div>

      {showMembers && (
        <SpaceMembersSidebar
          spaceId={spaceId}
          roles={[]}
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
