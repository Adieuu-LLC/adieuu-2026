/**
 * Channel view inside a Space.
 *
 * Displays messages for a single text channel using the shared
 * {@link ChannelMessageList} and {@link ChannelMessageBubble}.
 * When the Space or channel has a `cipherCheck`, messages are encrypted
 * locally with the matching Community Cipher before sending and decrypted
 * on display.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSpaces } from '../../hooks/useSpaces';
import { useIdentity } from '../../hooks/useIdentity';
import { useCipherStore } from '../../hooks/useCipherStore';
import { getSpaceCipherLink } from '../../services/spaceCipherService';
import { parsePayload } from '../../services/messagePayload';
import { Spinner } from '../../components/Spinner';
import { MessageComposer } from '../../components/composer/MessageComposer';
import type { ComposerSendFn } from '../../components/composer/composerTypes';
import {
  spaceMessageToChannel,
  type ChannelMessage,
} from '../../components/messaging/channelMessage';
import { ChannelMessageList } from '../../components/messaging/ChannelMessageList';
import { buildFlatMessageItems, type ChannelListItem } from '../../utils/buildFlatMessageItems';
import { useMessageScroll } from '../../hooks/useMessageScroll';
import { useMessageScrollOrchestration } from '../../hooks/useMessageScrollOrchestration';
import type { PublicSpaceMessage } from '@adieuu/shared';

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
  } = useSpaces();

  const { identity } = useIdentity();
  const { getCipherKey } = useCipherStore();

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

  const onSend: ComposerSendFn = useCallback(
    async (composerPayload: string) => {
      const { text } = parsePayload(composerPayload);
      if (!text) return;

      if (isEncrypted && spaceCipher) {
        const encrypted = encryptWithCipher(spaceCipher, toBytes(text));
        const serialized = serializeCipherPayload(encrypted);
        await sendMessage(JSON.stringify(serialized));
      } else {
        await sendMessage(text);
      }
    },
    [sendMessage, isEncrypted, spaceCipher],
  );

  const handleLoadOlder = useCallback(() => {
    void loadOlderMessages();
  }, [loadOlderMessages]);

  // Build channel messages from space messages (decrypt + adapt)
  const channelMessages: ChannelMessage[] = useMemo(() => {
    const chronological = [...activeMessages].reverse();
    return chronological.map((msg: PublicSpaceMessage) => {
      const body = decryptBody(msg.content, spaceCipher);
      return spaceMessageToChannel(msg, body);
    });
  }, [activeMessages, spaceCipher]);

  const messageLayoutKey = useMemo(
    () => channelMessages.map((m) => m.id).join(','),
    [channelMessages],
  );

  const flatItems: ChannelListItem<ChannelMessage>[] = useMemo(
    () => buildFlatMessageItems(channelMessages, 0, 0),
    [channelMessages],
  );

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

  // No-op handlers for actions not yet supported on Space channels
  const noopDelete = useCallback(() => {}, []);
  const noopReact = useCallback(() => {}, []);
  const noopToggleReaction = useCallback(() => {}, []);
  const noopReport = useCallback(() => {}, []);
  const noopFav = useCallback(() => {}, []);
  const emptyReactions = useCallback(() => [], []);

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
          getGroupedReactions={emptyReactions}
          onDeleteMessage={noopDelete}
          onReact={noopReact}
          onToggleReaction={noopToggleReaction}
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
          />
        )}
      </div>
    </div>
  );
}
