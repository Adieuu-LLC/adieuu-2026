/**
 * Shared channel pins hook.
 *
 * Manages pinned message state for a channel. Domain-specific API calls
 * are delegated to a {@link ChannelPinsAdapter}.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { ChannelMessage } from '../components/messaging/channelMessage';

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface ChannelPinsAdapter {
  pinMessage(channelId: string, messageId: string): Promise<boolean>;
  unpinMessage(channelId: string, messageId: string): Promise<boolean>;
  getPinnedMessages(
    channelId: string,
    cursor?: string | null,
  ): Promise<{ messages: ChannelMessage[]; nextCursor: string | null } | null>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChannelPins(
  channelId: string | null | undefined,
  adapter: ChannelPinsAdapter,
  canManage: boolean,
) {
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [pinnedCount, setPinnedCount] = useState(0);

  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;

  useEffect(() => {
    setPinnedMessageIds([]);
    setPinnedCount(0);
  }, [channelId]);

  const pinnedMessageIdsKey = useMemo(
    () => pinnedMessageIds.join(','),
    [pinnedMessageIds],
  );

  const onPin = useCallback(
    async (messageId: string) => {
      const cId = channelIdRef.current;
      if (!cId || !canManage) return;

      setPinnedMessageIds((prev) =>
        prev.includes(messageId) ? prev : [...prev, messageId],
      );
      setPinnedCount((c) => c + 1);

      try {
        const ok = await adapterRef.current.pinMessage(cId, messageId);
        if (!ok) {
          setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId));
          setPinnedCount((c) => Math.max(0, c - 1));
        }
      } catch {
        setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId));
        setPinnedCount((c) => Math.max(0, c - 1));
      }
    },
    [canManage],
  );

  const onUnpin = useCallback(
    async (messageId: string) => {
      const cId = channelIdRef.current;
      if (!cId || !canManage) return;

      setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId));
      setPinnedCount((c) => Math.max(0, c - 1));

      try {
        const ok = await adapterRef.current.unpinMessage(cId, messageId);
        if (!ok) {
          setPinnedMessageIds((prev) =>
            prev.includes(messageId) ? prev : [...prev, messageId],
          );
          setPinnedCount((c) => c + 1);
        }
      } catch {
        setPinnedMessageIds((prev) =>
          prev.includes(messageId) ? prev : [...prev, messageId],
        );
        setPinnedCount((c) => c + 1);
      }
    },
    [canManage],
  );

  const loadPinnedMessagesPage = useCallback(
    async (cId: string, cursor?: string | null) => {
      return adapterRef.current.getPinnedMessages(cId, cursor);
    },
    [],
  );

  const ingestSocketPinsUpdate = useCallback(
    (pinIds: string[]) => {
      setPinnedMessageIds(pinIds);
      setPinnedCount(pinIds.length);
    },
    [],
  );

  const ingestSocketPinChange = useCallback(
    (messageId: string, action: 'pinned' | 'unpinned') => {
      if (action === 'pinned') {
        setPinnedMessageIds((prev) =>
          prev.includes(messageId) ? prev : [...prev, messageId],
        );
        setPinnedCount((c) => c + 1);
      } else {
        setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId));
        setPinnedCount((c) => Math.max(0, c - 1));
      }
    },
    [],
  );

  return useMemo(
    () => ({
      pinnedMessageIds,
      pinnedMessageIdsKey,
      pinnedCount,
      canManagePins: canManage,
      onPin,
      onUnpin,
      loadPinnedMessagesPage,
      ingestSocketPinsUpdate,
      ingestSocketPinChange,
    }),
    [
      pinnedMessageIds,
      pinnedMessageIdsKey,
      pinnedCount,
      canManage,
      onPin,
      onUnpin,
      loadPinnedMessagesPage,
      ingestSocketPinsUpdate,
      ingestSocketPinChange,
    ],
  );
}
