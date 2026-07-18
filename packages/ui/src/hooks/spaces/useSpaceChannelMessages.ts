import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommunityCipher } from '@adieuu/crypto';
import type { PublicSpaceMessage } from '@adieuu/shared';
import {
  spaceMessageToChannel,
  type ChannelMessage,
} from '../../components/messaging/channelMessage';
import { buildFlatMessageItems, type ChannelListItem } from '../../utils/buildFlatMessageItems';
import { buildMessageLayoutKey, countVisibleMessages } from '../../pages/spaces/spaceChannelViewModel';

/**
 * Manages the decryption-cached channel message list, expiry tick, flat items,
 * visible count, and layout key for a space channel.
 */
export function useSpaceChannelMessages(params: {
  channelId: string | undefined;
  activeMessages: PublicSpaceMessage[];
  spaceCipher: CommunityCipher | null;
  decryptContent: (content: string | undefined) => string;
}) {
  const { channelId, activeMessages, spaceCipher, decryptContent } = params;

  // Per-message decryption cache. Decryption is a pure function of
  // (content, cipher), so as long as the cipher/channel is unchanged an
  // unmodified message never needs re-decrypting. The map is rebuilt from
  // the current buffer each pass (reusing prior bodies) so its size stays
  // bounded to the loaded window.
  const decryptCacheRef = useRef<{
    cipher: CommunityCipher | null;
    channelId: string | undefined;
    map: Map<string, { content: string; body: string }>;
  }>({ cipher: null, channelId: undefined, map: new Map() });

  const channelMessages: ChannelMessage[] = useMemo(() => {
    const cache = decryptCacheRef.current;
    if (cache.cipher !== spaceCipher || cache.channelId !== channelId) {
      cache.cipher = spaceCipher;
      cache.channelId = channelId;
      cache.map = new Map();
    }
    const prev = cache.map;
    const next = new Map<string, { content: string; body: string }>();
    const chronological = [...activeMessages].reverse();
    const result = chronological.map((msg: PublicSpaceMessage) => {
      const rawContent = msg.content ?? '';
      const cached = prev.get(msg.id);
      const body =
        cached && cached.content === rawContent
          ? cached.body
          : decryptContent(msg.content);
      next.set(msg.id, { content: rawContent, body });
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
