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
import { MessageComposer } from '../../components/composer/MessageComposer';
import type { ComposerSendFn, ComposerReplyContext } from '../../components/composer/composerTypes';
import {
  spaceMessageToChannel,
  type ChannelMessage,
} from '../../components/messaging/channelMessage';
import { ChannelMessageList } from '../../components/messaging/ChannelMessageList';
import { ChannelPinsMenu } from '../../components/messaging/ChannelPinsMenu';
import { buildFlatMessageItems, type ChannelListItem } from '../../utils/buildFlatMessageItems';
import { useMessageScroll } from '../../hooks/useMessageScroll';
import { useMessageScrollOrchestration } from '../../hooks/useMessageScrollOrchestration';
import { useChannelReactions } from '../../hooks/useChannelReactions';
import { createSpaceReactionsAdapter } from '../../hooks/adapters/spaceReactionsAdapter';
import { useChannelPins } from '../../hooks/useChannelPins';
import { createSpacePinsAdapter } from '../../hooks/adapters/spacePinsAdapter';
import { useReplyParentHydration, buildChannelReplyQuote } from '../../hooks/useReplyParentHydration';
import { createSpaceReplyAdapter } from '../../hooks/adapters/spaceReplyAdapter';
import type { PublicSpaceMessage } from '@adieuu/shared';
import type { ReplyQuotePayload } from '../conversations/conversationUtils';

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

  const flatItems: ChannelListItem<ChannelMessage>[] = useMemo(
    () => buildFlatMessageItems(channelMessages, 0, 0),
    [channelMessages],
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
          /* scroll to parent — TODO: implement scrollToMessageId */
        },
        t('conversations.replyDeleted', 'Message deleted'),
        t('conversations.replyOriginal', 'Original message'),
      );
    },
    [getParentInfo, participantProfiles, t],
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
    async (composerPayload: string) => {
      const parsed = parsePayload(composerPayload);
      const hasContent = !!parsed.text || parsed.gifAttachments.length > 0;
      if (!hasContent) return;

      if (editingMessage) {
        if (!spaceId || !channelId) return;
        let content = parsed.text;
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

      const content = parsed.isStructured ? composerPayload : parsed.text;

      if (isEncrypted && spaceCipher) {
        const encrypted = encryptWithCipher(spaceCipher, toBytes(content));
        const serialized = serializeCipherPayload(encrypted);
        await sendMessage(
          JSON.stringify(serialized),
          replyToMessageId,
          mentionedIdentityIds.length ? mentionedIdentityIds : undefined,
        );
      } else {
        await sendMessage(
          content,
          replyToMessageId,
          mentionedIdentityIds.length ? mentionedIdentityIds : undefined,
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
  // Report (stub)
  // ---------------------------------------------------------------------------

  const noopReport = useCallback(() => {}, []);
  const noopFav = useCallback(() => {}, []);

  const handleLinkClick = useCallback((href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  const wrappedSend: ComposerSendFn = useCallback(
    async (payload: string) => {
      markJustSent();
      await onSend(payload);
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
        <span className="space-channel-toolbar-hash">#</span>
        <span className="space-channel-toolbar-name">{activeChannel.name}</span>
        {isEncrypted && (
          <span className="spaces-badge spaces-badge--encrypted spaces-badge--toolbar">
            {t('spaces.encrypted')}
          </span>
        )}
        <div className="space-channel-toolbar-actions">
          <ChannelPinsMenu
            channelId={channelId!}
            pinnedCount={pinnedCount}
            pinnedMessageIdsKey={pinnedMessageIdsKey}
            loadPinnedMessagesPage={loadPinnedMessagesPage}
            onUnpin={async (msgId) => { await onUnpin(msgId); }}
            canUnpin={canManagePins}
            participantProfiles={participantProfiles}
            memberSettings={{}}
            identity={identity}
          />
        </div>
      </div>

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
          favoriteEmojis={[]}
          getGroupedReactions={getGroupedReactions}
          onDeleteMessage={handleDeleteMessage}
          onReact={onReact}
          onToggleReaction={onToggleReaction}
          onReportMessage={noopReport}
          onAddFavorite={noopFav}
          onRemoveFavorite={noopFav}
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
  );
}
