import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommunityCipher } from '@adieuu/crypto';
import type { PublicSpaceMessage } from '@adieuu/shared';
import {
  spaceMessageToChannel,
  type ChannelMessage,
} from '../../components/messaging/channelMessage';
import { buildFlatMessageItems, type ChannelListItem } from '../../utils/buildFlatMessageItems';
import { buildMessageLayoutKey, countVisibleMessages } from '../../pages/spaces/spaceChannelViewModel';
import type { DecryptableMessage } from '../../pages/spaces/spaceChannelCipher';

/**
 * Manages the decryption-cached channel message list, expiry tick, flat items,
 * visible count, and layout key for a space channel.
 */
export function useSpaceChannelMessages(params: {
  channelId: string | undefined;
  activeMessages: PublicSpaceMessage[];
  spaceCipher: CommunityCipher | null;
  decryptContent: (msg: DecryptableMessage | undefined) => string;
}) {
  const { channelId, activeMessages, spaceCipher, decryptContent } = params;

  const decryptCacheRef = useRef<{
    cipher: CommunityCipher | null;
    channelId: string | undefined;
    map: Map<string, { key: string; body: string }>;
  }>({ cipher: null, channelId: undefined, map: new Map() });

  const channelMessages: ChannelMessage[] = useMemo(() => {
    const cache = decryptCacheRef.current;
    if (cache.cipher !== spaceCipher || cache.channelId !== channelId) {
      cache.cipher = spaceCipher;
      cache.channelId = channelId;
      cache.map = new Map();
    }
    const prev = cache.map;
    const next = new Map<string, { key: string; body: string }>();
    const chronological = [...activeMessages].reverse();
    const result = chronological.map((msg: PublicSpaceMessage) => {
      const cacheKey = msg.ciphertext ?? msg.content ?? '';
      const cached = prev.get(msg.id);
      const body =
        cached && cached.key === cacheKey
          ? cached.body
          : decryptContent(msg);
      next.set(msg.id, { key: cacheKey, body });
      return spaceMessageToChannel(msg, body);
    });
    cache.map = next;
    return result;
  }, [activeMessages, decryptContent, spaceCipher, channelId]);

  const messageLayoutKey = useMemo(
    () => buildMessageLayoutKey(channelMessages),
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

  const visibleMessageCount = useMemo(
    () => countVisibleMessages(flatItems),
    [flatItems],
  );

  return { channelMessages, messageLayoutKey, flatItems, visibleMessageCount };
}
